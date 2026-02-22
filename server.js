require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const PDF = require("pdfkit");
const fs = require("fs");
const Excel = require("exceljs");

const app = express();

/* ================= RAW BODY CAPTURE (SHOPIFY SAFE) ================= */

const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) req.rawBody = buf;
};

app.use(express.json({ verify: rawBodySaver }));
app.use(express.urlencoded({ verify: rawBodySaver, extended: true }));

/* ================= STATIC ================= */

app.use("/invoices", express.static("invoices"));

/* ================= MONGO ================= */

mongoose.connect(process.env.MONGO)
.then(()=>console.log("Mongo Connected"))
.catch(e=>console.log("Mongo Error",e));

const OrderSchema = new mongoose.Schema({
 order_id:String,
 invoice_no:String,
 gstNumber:String,
 gstName:String,
 total:Number,
 igst:Number,
 cgst:Number,
 sgst:Number,
 created:Date
});

const Order = mongoose.model("Order",OrderSchema);

/* ================= BASIC ================= */

app.get("/",(_,res)=>res.send("Skypper OTP Server Running"));
app.get("/apps/otp",(_,res)=>res.send("Skypper OTP App Proxy Connected"));

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url);
 next();
});

/* ================= OTP ================= */

const OTP={};

function genOtp(){
 return Math.floor(100000+Math.random()*900000);
}

/* ================= COD WEBHOOK ================= */

app.post("/webhook/order",async(req,res)=>{

 try{

 const hmac=req.headers["x-shopify-hmac-sha256"];

 const digest=crypto.createHmac("sha256",process.env.WEBHOOK_SECRET)
 .update(req.rawBody)
 .digest("base64");

 if(hmac!==digest) return res.sendStatus(401);

 const order=req.body;

 if(!order.payment_gateway_names.some(g=>g.toLowerCase().includes("cash")))
  return res.sendStatus(200);

 const phone=order.shipping_address.phone.replace("+91","");

 const otp=genOtp();

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
 route:"dlt",
 sender_id:"SKYPPR",
 message:"206657",
 variables_values:otp.toString(),
 numbers:phone,
 dlt_content_template_id:"1207176101128509773"
 },{
 headers:{
 authorization:process.env.SMS_API_KEY,
 "Content-Type":"application/json"
 }
 });

 res.sendStatus(200);

 }catch(e){
 console.log("COD ERROR",e);
 res.sendStatus(500);
 }

});

/* ================= CART OTP ================= */

app.post("/send-cart-otp",async(req,res)=>{

 const phone=req.body.phone;
 if(!phone||phone.length!==10) return res.json({success:false});

 const otp=genOtp();
 OTP["cart_"+phone]={otp,time:Date.now()};

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
 route:"dlt",
 sender_id:"SKYPPR",
 message:"206657",
 variables_values:otp.toString(),
 numbers:phone,
 dlt_content_template_id:"1207176101128509773"
 },{
 headers:{
 authorization:process.env.SMS_API_KEY,
 "Content-Type":"application/json"
 }
 });

 res.json({success:true});
});

/* ================= VERIFY ================= */

app.post("/verify",async(req,res)=>{

 const {phone,otp}=req.body;

 const rec=OTP["cart_"+phone];

 if(!rec||rec.otp!=otp||(Date.now()-rec.time)>300000)
  return res.json({success:false});

 delete OTP["cart_"+phone];

 res.json({success:true});
});

/* ================= GST ================= */

function gstBreakup(amount,type){
 if(type==="IGST") return {igst:amount*0.18,cgst:0,sgst:0};
 return {igst:0,cgst:amount*0.09,sgst:amount*0.09};
}

/* ================= INVOICE ================= */

function generateInvoice(order,gst,gstName,gstNumber){

 if(!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");

 const doc=new PDF({margin:40});
 doc.pipe(fs.createWriteStream(`invoices/${order.id}.pdf`));

 doc.fontSize(20).text("SKYPPER LIFESTYLE");
 doc.fontSize(10).text("GSTIN: YOURGST",{align:"right"});

 doc.moveDown();

 doc.text(`Invoice: SKY-${order.order_number}`);
 doc.text(`Date: ${new Date().toLocaleDateString()}`);

 doc.moveDown();

 doc.text("Bill To:");
 doc.text(gstName||order.shipping_address.name);
 doc.text(`GSTIN: ${gstNumber||"N/A"}`);
 doc.text(order.shipping_address.address1);

 doc.moveDown();

 order.line_items.forEach(i=>{
 doc.text(`${i.title}  x${i.quantity}  ₹${i.price}`);
 });

 doc.moveDown();

 doc.text(`IGST: ₹${gst.igst.toFixed(2)}`);
 doc.text(`CGST: ₹${gst.cgst.toFixed(2)}`);
 doc.text(`SGST: ₹${gst.sgst.toFixed(2)}`);

 doc.moveDown();
 doc.fontSize(14).text(`Total: ₹${order.total_price}`,{align:"right"});

 doc.end();
}

/* ================= ORDER PAID ================= */

app.post("/shopify/order-paid",async(req,res)=>{

 try{

 const order=req.body;

 const gstNumber=order.note_attributes?.find(x=>x.name==="GST Number")?.value||"";
 const gstName=order.note_attributes?.find(x=>x.name==="GST Business Name")?.value||"";

 const STORE_STATE="BR";
 const customerState=order.shipping_address?.province_code;

 let type="IGST";
 if(customerState===STORE_STATE) type="CGST";

 const gst=gstBreakup(Number(order.total_price),type);

 await Order.create({
 order_id:order.id,
 invoice_no:"SKY-"+order.order_number,
 gstNumber,
 gstName,
 total:order.total_price,
 igst:gst.igst,
 cgst:gst.cgst,
 sgst:gst.sgst,
 created:new Date()
 });

 generateInvoice(order,gst,gstName,gstNumber);

 res.send("OK");

 }catch(e){
 console.log("PAID ERROR",e);
 res.sendStatus(500);
 }

});

/* ================= GST EXCEL ================= */

app.get("/gst/excel",async(req,res)=>{

 const orders=await Order.find();

 const wb=new Excel.Workbook();
 const ws=wb.addWorksheet("GST");

 ws.addRow(["Invoice","GSTIN","Name","Total","IGST","CGST","SGST"]);

 orders.forEach(o=>{
 ws.addRow([o.invoice_no,o.gstNumber,o.gstName,o.total,o.igst,o.cgst,o.sgst]);
 });

 res.setHeader("Content-Disposition","attachment; filename=gst.xlsx");
 await wb.xlsx.write(res);
 res.end();
});

/* ================= START ================= */

app.listen(10000,()=>console.log("Server running"));