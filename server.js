require('dotenv').config()

const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()

/* ================= BASIC SETUP ================= */

app.use(cors())
app.use(bodyParser.json())

app.get("/", (req,res)=>{
  res.send("Skypper OTP Server Running")
})

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url)
 next()
})

/* ================= MEMORY OTP STORE ================= */

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* ================= SEND OTP SMS ================= */

async function sendOtpSMS(phone, otp){

 console.log("DLT TEMPLATE ID:", process.env.DLT_TEMPLATE_ID)

 try{

   const response = await axios.post(
     "https://www.fast2sms.com/dev/bulkV2",
     {
       route: "dlt",
       sender_id: "SKYPPR",

       message: "Dear Customer, your OTP is {#var#}. Please do not share this OTP with anyone. -SKYPPER LIFESTYLE PVT. LTD.",

       variables: "var",
       variables_values: otp.toString(),

       numbers: phone,

       // TEMPLATE ID
       dlt_content_template_id: process.env.DLT_TEMPLATE_ID,

       // ENTITY ID
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

 const phone = "PUT_YOUR_OWN_NUMBER"
 const otp = "123456"

 const ok = await sendOtpSMS(phone, otp)

 res.json({success: ok})
})

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

/* ================= VERIFY OTP ================= */

app.post('/verify', async(req,res)=>{

 const {phone,otp}=req.body

 const cleanPhone = phone.replace(/\D/g,'').slice(-10)
 const rec=OTP["cart_"+cleanPhone]

 if(!rec || rec.otp!=otp || (Date.now()-rec.time)>300000)
   return res.json({success:false})

 delete OTP["cart_"+cleanPhone]

 return res.json({success:true})
})

/* ================= SERVER ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
