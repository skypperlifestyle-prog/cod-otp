require('dotenv').config()

const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const crypto = require('crypto')

const app = express()

/* ================= BASIC SETUP ================= */

app.get("/", (req,res)=>{
  res.send("Skypper OTP Server Running")
})

app.get("/apps/otp", (req,res)=>{
  res.send("Skypper OTP App Proxy Connected")
})

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url)
 next()
})

app.use(bodyParser.json())
app.use('/webhook/order', bodyParser.raw({ type: 'application/json' }))

/* ================= MEMORY OTP STORE ================= */

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* ================= SEND OTP SMS ================= */

async function sendOtpSMS(phone, otp){

 console.log("DLT TEMPLATE:", process.env.DLT_TEMPLATE_ID)

 try{

   const response = await axios.post(
     "https://www.fast2sms.com/dev/bulkV2",
     {
       route: "dlt",
       sender_id: "SKYPPR",

       message: "Dear Customer, your OTP is {#var#}. Please do not share this OTP with anyone. -SKYPER LIFESTYLE PVT. LTD.",

       variables: "var",
       variables_values: otp.toString(),

       numbers: phone,

       dlt_content_template_id: process.env.DLT_TEMPLATE_ID,
       dlt_entity_id: "1201175350686304903"
     },
     {
       headers:{
         authorization: process.env.SMS_API_KEY,
         "Content-Type":"application/json"
       }
     }
   )

   console.log("SMS SENT:", response.data)
   return true

 }catch(err){
   console.log("SMS ERROR:", err.response?.data || err.message)
   return false
 }
}

/* ================= TEST SMS ================= */

app.get('/test-sms', async(req,res)=>{

 const phone = "YOUR_10_DIGIT_NUMBER"
 const otp = "123456"

 try{

 const result = await axios.post(
  "https://www.fast2sms.com/dev/bulkV2",
  {
    route:"dlt",
    sender_id:"SKYPPR",

    message:"Dear Customer, your OTP is {#var#}. Please do not share this OTP with anyone. -SKYPER LIFESTYLE PVT. LTD.",

    variables:"var",
    variables_values: otp,

    numbers: phone,

    dlt_content_template_id: process.env.DLT_TEMPLATE_ID,
    dlt_entity_id:"1201175350686304903"
  },
  {
    headers:{
     authorization: process.env.SMS_API_KEY,
     "Content-Type":"application/json"
    }
  })

 res.json(result.data)

 }catch(e){
  res.json(e.response?.data || e.message)
 }

})

/* ================= CART OTP ================= */

app.post('/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone || phone.length!==10){
   return res.json({success:false})
 }

 const otp = genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 const sent = await sendOtpSMS(phone, otp)

 if(!sent) return res.json({success:false})

 res.json({success:true})
})

/* ================= SERVER ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
