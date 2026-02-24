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

/* ================= MEMORY OTP STORE ================= */

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* ================= FAST2SMS DLT ================= */

async function sendOtpSMS(phone, otp){

 console.log("SENDING TO:", phone)
 console.log("OTP:", otp)
 console.log("TEMPLATE:", process.env.1207177164946897291)

 try{

   const response = await axios.post(
     "https://www.fast2sms.com/dev/bulkV2",
     {
       route: "dlt",
       sender_id: "SKYPPR",

       // MUST MATCH YOUR APPROVED TEMPLATE
       message: "Dear Customer, your OTP for confirming your Cash on Delivery order is {#var#}. Please do not share this OTP with anyone. -SKYPPER LIFESTYLE PVT. LTD.",

       variables: "var",
       variables_values: otp.toString(),

       numbers: phone,

       // YOUR APPROVED TEMPLATE
       template_id: process.env.1207177164946897291
     },
     {
       headers:{
         authorization: process.env.uCPGDhRsb5Dh42WWfbD86EEoI4MhzG4Pzxqm9Yg8KYMG5fNAtHkACzvbR5Wh,
         "Content-Type":"application/json"
       }
     }
   )

   console.log("FAST2SMS RESPONSE:", response.data)

   return response.data?.return === true

 }catch(err){

   console.log("FAST2SMS ERROR:", err.response?.data || err.message)
   return false
 }
}

/* ================= CART OTP ================= */

app.post('/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone || phone.length!==10){
   return res.json({success:false,message:"Invalid phone"})
 }

 const otp = genOtp()

 OTP["cart_"+phone]={otp,time:Date.now()}

 const sent = await sendOtpSMS(phone, otp)

 if(!sent){
   return res.json({success:false,message:"SMS failed"})
 }

 res.json({success:true})
})

/* ================= VERIFY ================= */

app.post('/verify', async(req,res)=>{

 const phone=req.body.phone?.replace(/\D/g,'').slice(-10)
 const otp=req.body.otp

 if(!phone || !otp) return res.json({success:false})

 const rec=OTP["cart_"+phone]

 if(!rec){
   return res.json({success:false})
 }

 if(rec.otp!=otp){
   return res.json({success:false})
 }

 if((Date.now()-rec.time)>300000){
   return res.json({success:false})
 }

 delete OTP["cart_"+phone]

 return res.json({success:true})
})

/* ================= START ================= */

app.listen(10000,()=>console.log("OTP Server Running on 10000"))
