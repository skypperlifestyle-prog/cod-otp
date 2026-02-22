require('dotenv').config()
const SMS_API = process.env.SMS_API_KEY;
const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const mongoose = require("mongoose");
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
const app = express()
mongoose.connect(process.env.MONGO)
.then(()=>console.log("Mongo Connected"))
.catch(err=>console.log("Mongo Error",err));
app.get("/", (req,res)=>{
  res.send("Skypper OTP Server Running");
});

app.get("/apps/otp", (req,res)=>{
  res.send("Skypper OTP App Proxy Connected");
});

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url);
 next();
});

app.use('/webhook/order', bodyParser.raw({ type: 'application/json' }))
app.use(bodyParser.json())

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}
function gstBreakup(amount,type){
 if(type==="IGST"){
  return{igst:amount*0.18,cgst:0,sgst:0}
 }
 return{igst:0,cgst:amount*0.09,sgst:amount*0.09}
}
const PDF = require("pdfkit");
const fs = require("fs");

function generateInvoice(order,gst,gstName,gstNumber){

 if(!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");

 const doc = new PDF({margin:40});
 doc.pipe(fs.createWriteStream(`invoices/${order.id}.pdf`));

 // HEADER
 doc.fontSize(20).text("SKYPPER LIFESTYLE",40,40);
 doc.fontSize(10).text("Your Company Address\nGSTIN: 10ABCDE1234F1Z5",{align:"right"});

 doc.moveDown();

 // INVOICE META
 doc.fontSize(12).text(`Invoice No: SKY/${order.order_number}`);
 doc.text(`Date: ${new Date().toLocaleDateString()}`);

 doc.moveDown();

 // BUYER
 doc.text("Bill To:");
 doc.text(`${gstName || order.shipping_address.name}`);
 doc.text(`GSTIN: ${gstNumber || "N/A"}`);
 doc.text(`${order.shipping_address.address1}`);
 doc.text(`${order.shipping_address.city}, ${order.shipping_address.province}`);

 doc.moveDown();

 // TABLE HEADER
 doc.fontSize(11);
 doc.text("Item",40);
 doc.text("Qty",250);
 doc.text("Rate",300);
 doc.text("Total",380);

 doc.moveDown();

 let y = doc.y;

 order.line_items.forEach(i=>{
   doc.text(i.title,40,y);
   doc.text(i.quantity.toString(),250,y);
   doc.text((i.price).toString(),300,y);
   doc.text((i.quantity*i.price).toFixed(2),380,y);
   y+=20;
 });

 doc.moveDown();

 // TOTALS
 doc.text(`Subtotal: ₹${order.total_price}`);
 doc.text(`IGST: ₹${gst.igst.toFixed(2)}`);
 doc.text(`CGST: ₹${gst.cgst.toFixed(2)}`);
 doc.text(`SGST: ₹${gst.sgst.toFixed(2)}`);

 doc.moveDown();
 doc.fontSize(14).text(`Grand Total: ₹${order.total_price}`,{align:"right"});

 doc.moveDown(2);

 doc.fontSize(10).text("Authorized Signatory",{align:"right"});

 doc.end();
}
/* COD WEBHOOK */
app.post('/webhook/order', async(req,res)=>{

 const hmac=req.headers['x-shopify-hmac-sha256']
 const digest=crypto.createHmac('sha256',process.env.WEBHOOK_SECRET)
 .update(req.body,'utf8')
 .digest('base64')

 if(hmac!==digest) return res.sendStatus(401)

 const order=JSON.parse(req.body)

 if(!order.payment_gateway_names.some(g=>g.toLowerCase().includes('cash')))
  return res.sendStatus(200)

 const phone=order.shipping_address.phone.replace('+91','')
 const otp=genOtp()

 OTP[order.id]={otp,time:Date.now()}

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
   route: "dlt",
   sender_id: "SKYPPR",
   message: "206657",
   variables_values: otp.toString(),
   numbers: phone,
   dlt_content_template_id: "1207176101128509773"
 },{
  headers:{
   authorization: process.env.SMS_API_KEY,
   "Content-Type":"application/json"
  }
 })

 res.sendStatus(200)
})

/* CART OTP */
app.post('/send-cart-otp', async(req,res)=>{

 const phone=req.body.phone;
 if(!phone || phone.length!==10){
   return res.json({success:false});
 }

 const otp=genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 try{

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
   route: "dlt",
   sender_id: "SKYPPR",
   message: "206657",
   variables_values: otp.toString(),
   numbers: phone,
   dlt_content_template_id: "1207176101128509773"
 },{
  headers:{
   authorization: process.env.SMS_API_KEY,
   "Content-Type":"application/json"
  }
 })

 }catch(err){
  console.log("SMS ERROR:", err.response?.data || err.message)
 }

 res.json({success:true})
})

/* VERIFY */
app.post('/verify', async(req,res)=>{

 const {phone,otp,order_id}=req.body

 if(phone){
  const rec=OTP["cart_"+phone]
  if(!rec||rec.otp!=otp||(Date.now()-rec.time)>300000)
   return res.json({success:false})

  delete OTP["cart_"+phone]
  return res.json({success:true})
 }

 if(order_id){
  const rec=OTP[order_id]
  if(!rec||rec.otp!=otp||(Date.now()-rec.time)>300000)
   return res.json({success:false})

  delete OTP[order_id]

  await axios.put(
   `https://${process.env.SHOP}/admin/api/2024-01/orders/${order_id}.json`,
   {order:{id:order_id,tags:"COD-Verified"}},
   {headers:{"X-Shopify-Access-Token":process.env.TOKEN}}
  )

  return res.json({success:true})
 }

 res.json({success:false})
})
app.post("/shopify/order-paid",async(req,res)=>{

const order=req.body;

const gstNumber = order.note_attributes?.find(x=>x.name==="GST Number")?.value || "";
const gstName = order.note_attributes?.find(x=>x.name==="GST Business Name")?.value || "";

const STORE_STATE="BR"; // Bihar
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

});
const Excel = require("exceljs");

app.get("/gst/excel",async(req,res)=>{

const orders=await Order.find();

const wb=new Excel.Workbook();
const ws=wb.addWorksheet("GST");

ws.addRow(["Invoice","GSTIN","Name","Total","IGST","CGST","SGST"]);

orders.forEach(o=>{
ws.addRow([
o.invoice_no,
o.gstNumber,
o.gstName,
o.total,
o.igst,
o.cgst,
o.sgst
]);
});

res.setHeader("Content-Disposition","attachment; filename=gst.xlsx");
await wb.xlsx.write(res);
res.end();

});
app.listen(10000,()=>console.log("Server running"))