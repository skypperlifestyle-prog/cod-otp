require('dotenv').config()

const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

/* ================= BASIC ================= */

app.use(cors())
app.use(bodyParser.json())

app.get("/", (req,res)=>{
  res.send("Skypper OTP Server Running")
})

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url)
 next()
})

/* ================= OTP MEMORY ================= */

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* ================= FAST2SMS DLT ================= */

async function sendOtpSMS(phone, otp){

 try{

   const response = await axios.post(
     "https://www.fast2sms.com/dev/bulkV2",
     {
       route: "dlt",
       sender_id: "SKYPPR",

       // YOUR APPROVED TEMPLATE
       template_id: "1207177164946897291",

       variables_values: otp.toString(),
       numbers: phone
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

/* ================= CART OTP ================= */

app.post('/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone || phone.length!==10){
   return res.json({success:false})
 }

 const otp = genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 console.log("PHONE:", phone)
 console.log("OTP:", otp)

 const sent = await sendOtpSMS(phone, otp)

 if(!sent) return res.json({success:false})

 res.json({success:true})
})

/* ================= VERIFY ================= */

app.post('/verify', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)
 const otp = req.body.otp

 const rec = OTP["cart_"+phone]

 if(!rec || rec.otp!=otp || (Date.now()-rec.time)>300000){
   return res.json({success:false})
 }

 delete OTP["cart_"+phone]

 return res.json({success:true})
})

/* ================= SERVER ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
