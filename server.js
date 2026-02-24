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
  console.log("HIT:", req.method, req.url)
  next()
})

/* ================= MEMORY STORE ================= */

const OTP_STORE = {}

function generateOtp(){
  return Math.floor(100000 + Math.random()*900000)
}

/* ================= FAST2SMS DLT SEND ================= */

async function sendOtpSMS(phone, otp){

  try{

    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "dlt",
        sender_id: "SKYPPR",

        // YOUR APPROVED MESSAGE ID
        message: "209839",

        // OTP goes here
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

    console.log("FAST2SMS RESPONSE:", response.data)

    return true

  }catch(error){

    console.log("FAST2SMS ERROR:", error.response?.data || error.message)

    return false
  }
}

/* ================= SEND CART OTP ================= */

app.post('/send-cart-otp', async(req,res)=>{

  const phone = req.body.phone?.replace(/\D/g,'').slice(-10)

  if(!phone || phone.length !== 10){
    return res.json({ success:false })
  }

  const otp = generateOtp()

  OTP_STORE[phone] = {
    otp: otp,
    time: Date.now()
  }

  console.log("PHONE:", phone)
  console.log("OTP:", otp)

  const sent = await sendOtpSMS(phone, otp)

  res.json({ success: sent })
})

/* ================= VERIFY OTP ================= */

app.post('/verify', (req,res)=>{

  const phone = req.body.phone?.replace(/\D/g,'').slice(-10)
  const otp = req.body.otp

  if(!phone || !otp){
    return res.json({ success:false })
  }

  const record = OTP_STORE[phone]

  if(!record){
    return res.json({ success:false })
  }

  // Expire after 5 minutes
  if(Date.now() - record.time > 300000){
    delete OTP_STORE[phone]
    return res.json({ success:false })
  }

  if(record.otp != otp){
    return res.json({ success:false })
  }

  delete OTP_STORE[phone]

  return res.json({ success:true })
})

/* ================= START SERVER ================= */

app.listen(10000, ()=>{
  console.log("SERVER LIVE ON 10000")
})
