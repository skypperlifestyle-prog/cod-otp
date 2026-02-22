require('dotenv').config()
const SMS_API = process.env.SMS_API_KEY;
const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const mongoose = require("mongoose");
const app = express()
mongoose.connect(process.env.MONGO,{
 useNewUrlParser:true,
 useUnifiedTopology:true
}).then(()=>console.log("Mongo Connected"))
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

app.listen(10000,()=>console.log("Server running"))