require('dotenv').config()
const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const crypto = require('crypto')

const app = express()

app.use(bodyParser.raw({type:'application/json'}))

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* WEBHOOK */
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

 OTP[order.id]=otp

 await axios.get(process.env.SMS_URL,{
   params:{
     numbers:phone,
     message:`Skypper OTP ${otp}`
   }
 })

 res.sendStatus(200)
})
app.use(bodyParser.json())

app.post('/send-cart-otp', async(req,res)=>{

 const phone=req.body.phone
 const otp=Math.floor(100000 + Math.random()*900000)

 OTP["cart_"+phone]=otp

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
if(phone){
 if(OTP["cart_"+phone]!=otp)
   return res.json({success:false})

 delete OTP["cart_"+phone]
 return res.json({success:true})
}
/* VERIFY */
app.post('/verify',bodyParser.json(),async(req,res)=>{

 const {phone,otp,order_id}=req.body

 if(OTP[order_id]!=otp) return res.json({success:false})

 delete OTP[order_id]

 await axios.put(
 `https://${process.env.SHOP}/admin/api/2024-01/orders/${order_id}.json`,
 {order:{id:order_id,tags:"COD-Verified"}},
 {headers:{"X-Shopify-Access-Token":process.env.TOKEN}}
 )

 res.json({success:true})
})


app.listen(10000)

