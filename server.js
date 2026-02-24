require('dotenv').config()

const express = require('express')
const axios = require('axios')

const app = express()
app.use(express.json())

/* ================= BASIC ================= */

app.get("/", (req,res)=>{
  res.send("Skypper OTP Server Running")
})

app.use((req,res,next)=>{
 console.log("HIT:",req.method,req.url)
 next()
})

/* ================= MEMORY STORE ================= */

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

       // THIS MUST MATCH APPROVED TEMPLATE TEXT
       message: "Dear Customer, your OTP is {#var#}. Please do not share this OTP with anyone.",

       variables_values: otp.toString(),
       numbers: phone,

       // YOUR TEMPLATE ID
       dlt_content_template_id: process.env.DLT_TEMPLATE_ID
     },
     {
       headers:{
         authorization: process.env.SMS_API_KEY,
         "Content-Type":"application/json"
       }
     }
   )

   console.log("FAST2SMS:", response.data)
   return true

 }catch(err){
   console.log("FAST2SMS ERROR:", err.response?.data || err.message)
   return false
 }
}

/* ================= SEND CART OTP ================= */

app.post('/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone || phone.length!==10){
   return res.json({success:false})
 }

 const otp = genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 console.log("PHONE:",phone,"OTP:",otp)

 const sent = await sendOtpSMS(phone, otp)

 if(!sent){
   return res.json({success:false})
 }

 res.json({success:true})
})

/* ================= VERIFY ================= */

app.post('/verify', async(req,res)=>{

 const phone=req.body.phone?.replace(/\D/g,'').slice(-10)
 const otp=req.body.otp

 const rec=OTP["cart_"+phone]

 if(!rec) return res.json({success:false})
 if(rec.otp!=otp) return res.json({success:false})
 if((Date.now()-rec.time)>300000) return res.json({success:false})

 delete OTP["cart_"+phone]

 res.json({success:true})
})

/* ================= START ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
