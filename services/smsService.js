const twilio = require("twilio");
require("dotenv").config();

const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Function to send an SMS notification
const sendSMS = async (to, message) => {
  try {
    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to, // Recipient's phone number
    });

    console.log(`📩 SMS sent successfully to ${to}: ${response.sid}`);
    return response;
  } catch (error) {
    console.error("❌ Error sending SMS:", error.message);
  }
};

module.exports = sendSMS;
