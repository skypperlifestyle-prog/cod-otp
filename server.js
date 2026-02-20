require('dotenv').config()
const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const crypto = require('crypto')

const app = express()

/* Needed for Shopify webhook */
app.use('/webhook/order', bodyParser.raw({type:'application/json'}))
app.use(bodyParser.json())

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* =========================
   SHOPIFY ORDER WEBHOOK
========================= */
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

 OTP[order.id]={ otp, time:Date.now() }

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
  route:"otp",
  numbers:phone,
  message:`Skypper OTP is ${otp}`
 },{
  headers:{
   authorization:process.env.SMS_API_KEY,
   "Content-Type":"application/json"
  }
 })

 res.sendStatus(200)
})

/* =========================
   CART OTP SEND
========================= */
app.post('/send-cart-otp', async(req,res)=>{

 const phone=req.body.phone
 const otp=genOtp()

 OTP["cart_"+phone]={ otp, time:Date.now() }

 await axios.post("https://www.fast2sms.com/dev/bulkV2",{
  route:"otp",
  numbers:phone,
  message:`Skypper OTP is ${otp}`
 },{
  headers:{
   authorization:process.env.SMS_API_KEY,
   "Content-Type":"application/json"
  }
 })

 res.json({success:true})
})

/* =========================
   VERIFY OTP
========================= */
app.post('/verify', async(req,res)=>{

 const {phone,otp,order_id}=req.body

 /* CART VERIFICATION */
 if(phone){
   const record=OTP["cart_"+phone]

   if(!record || record.otp!=otp || (Date.now()-record.time)>300000)
     return res.json({success:false})

   delete OTP["cart_"+phone]
   return res.json({success:true})
 }

 /* COD ORDER VERIFICATION */
 if(order_id){
   const record=OTP[order_id]

   if(!record || record.otp!=otp || (Date.now()-record.time)>300000)
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
