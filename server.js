require('dotenv').config()

const express = require('express')
const axios = require('axios')

const app = express()
app.use(express.json())

app.get("/",(_,res)=>res.send("OTP Server Running"))

const OTP = {}

function genOtp(){
 return Math.floor(100000 + Math.random()*900000)
}

/* ===== FAST2SMS DLT SEND ===== */

async function sendSMS(phone, otp){

 try{

   const r = await axios.post(
     "https://www.fast2sms.com/dev/bulkV2",
     {
       route:"dlt",
       sender_id:"SKYPPR",

       // THIS IS YOUR APPROVED MESSAGE ID
       message:"206657",

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

   console.log("FAST2SMS:", r.data)
   return true

 }catch(e){
   console.log("FAST2SMS ERROR:", e.response?.data || e.message)
   return false
 }
}

/* ===== SEND CART OTP ===== */

app.post('/send-cart-otp', async(req,res)=>{

 const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

 if(!phone) return res.json({success:false})

 const otp = genOtp()

 OTP[phone]={otp,time:Date.now()}

 console.log("PHONE:",phone)
 console.log("OTP:",otp)

 const ok = await sendSMS(phone, otp)

 res.json({success: ok})
})

/* ===== VERIFY ===== */

app.post('/verify',(req,res)=>{

 const phone=req.body.phone?.replace(/\D/g,'').slice(-10)
 const otp=req.body.otp

 const rec=OTP[phone]

 if(!rec) return res.json({success:false})

 if(rec.otp!=otp) return res.json({success:false})

 delete OTP[phone]

 res.json({success:true})
})

app.listen(10000,()=>console.log("SERVER LIVE"))
