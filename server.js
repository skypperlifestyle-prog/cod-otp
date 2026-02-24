require('dotenv').config()

const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')

const app = express()

/* ================= BASIC ================= */

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

       // EXACT APPROVED MESSAGE
       message: "Dear Customer, your OTP for confirming your Cash on Delivery order is {#var#}. Please do not share this OTP with anyone. -SKYPPER LIFESTYLE PVT. LTD.",

       variables: "var",
       variables_values: otp.toString(),

       numbers: phone,

       // YOUR TEMPLATE
       template_id: process.env.DLT_TEMPLATE_ID
     },
     {
       headers:{
         authorization: process.env.SMS_API_KEY,
         "Content-Type":"application/json"
       }
     }
   )

   console.log("FAST2SMS:", response.data)

   return response.data?.return === true

 }catch(err){

   console.log("FAST2SMS ERROR:", err.response?.data || err.message)
   return false
 }
}

/* ======================================================
   SHOPIFY APP PROXY ROUTES (MUST BE /apps/otp/...)
====================================================== */

/* SEND OTP */

app.post('/apps/otp/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone || phone.length!==10){
   return res.json({success:false})
 }

 const otp = genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 console.log("PHONE:", phone)
 console.log("OTP:", otp)

 const sent = await sendOtpSMS(phone, otp)

 if(!sent){
   return res.json({success:false})
 }

 res.json({success:true})
})


/* VERIFY OTP */

app.post('/apps/otp/verify', async(req,res)=>{

 const phone=req.body.phone?.replace(/\D/g,'').slice(-10)
 const otp=req.body.otp

 if(!phone || !otp) return res.json({success:false})

 const rec=OTP["cart_"+phone]

 if(!rec) return res.json({success:false})

 if(rec.otp!=otp) return res.json({success:false})

 if((Date.now()-rec.time)>300000) return res.json({success:false})

 delete OTP["cart_"+phone]

 return res.json({success:true})
})

/* ================= START ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
