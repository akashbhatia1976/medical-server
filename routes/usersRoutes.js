const express = require("express");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const authenticateUser = require("../middleware/authenticateUser");


const router = express.Router();

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users";
const saltRounds = 10;

// ✅ Twilio Setup for SMS
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// ✅ Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Generate a unique HealthID
const generateHealthID = () => {
  return `AETHER-${Math.floor(100000 + Math.random() * 900000)}`;
};

// ✅ Check if a user exists
router.get("/exists/:userId", async (req, res) => {
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const existingUser = await collection.findOne({ userId: decodeURIComponent(req.params.userId) });
    res.json({ exists: !!existingUser });
  } catch (error) {
    console.error("❌ Error checking user existence:", error);
    res.status(500).json({ error: "Error checking user existence." });
  }
});

// ✅ Register a new user with email/phone verification & HealthID
router.post("/register", async (req, res) => {
  const { userId, email, phone, password } = req.body;
  console.log("📩 Registration request received:", { userId, email, phone });

  if (!userId || userId.includes(" ") || !password || password.length < 6 || (!email && !phone)) {
    return res.status(400).json({ error: "Invalid input. Ensure User ID has no spaces, password is 6+ chars, and provide email/phone." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const existingUser = await collection.findOne({ $or: [{ email }, { phone }, { userId }] });
    if (existingUser) {
      const duplicateFields = [];
      if (existingUser.userId === userId) duplicateFields.push("User ID");
      if (existingUser.email === email) duplicateFields.push("Email");
      if (existingUser.phone === phone) duplicateFields.push("Phone");
      return res.status(400).json({ error: `The following already exist: ${duplicateFields.join(", ")}. Please use a different one.` });
    }

    console.log("✅ No duplicates found, proceeding with registration...");
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const healthId = generateHealthID();
    const verificationToken = email ? crypto.randomBytes(32).toString("hex") : null;
    const phoneVerificationToken = phone ? Math.floor(100000 + Math.random() * 900000).toString() : null;

    await collection.insertOne({
      userId,
      healthId,
      email,
      phone,
      password: hashedPassword,
      verified: false,
      verificationToken,
      phoneVerificationToken,
      createdAt: new Date(),
    });

    let emailSent = false, smsSent = false;
    if (email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Verify Your Email - Aether Medical App",
          text: `Click here to verify your email: ${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`,
        });
        emailSent = true;
      } catch (emailError) {
        console.warn(`⚠️ Email verification failed: ${emailError.message}`);
      }
    }

    if (phone) {
      try {
        await twilioClient.messages.create({
          body: `Your Aether App verification code is: ${phoneVerificationToken}`,
          from: TWILIO_PHONE_NUMBER,
          to: phone,
        });
        smsSent = true;
      } catch (twilioError) {
        console.warn(`⚠️ Twilio SMS failed: ${twilioError.message}`);
      }
    }

    res.status(201).json({ message: "User registered successfully.", healthId, emailSent, smsSent });

  } catch (error) {
    console.error("❌ Error registering user:", error);
    res.status(500).json({ error: "Registration error." });
  }
});

// ✅ Verify Email
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Verification token is required." });

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ error: "Invalid or expired verification token." });

    await collection.updateOne({ verificationToken: token }, { $set: { verified: true, verificationToken: null } });
    res.status(200).json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    console.error("❌ Error verifying email:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ User Login
router.post("/login", async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ error: "User ID and password required." });

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const user = await collection.findOne({ userId });

    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.verified) return res.status(403).json({ error: "Email/phone not verified. Please check your inbox." });
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Incorrect password." });

    res.json({ message: "Login successful.", userId, healthId: user.healthId });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});


// ✅ Fetch user details by HealthID
router.get("/healthid/:healthId", async (req, res) => {
  const { healthId } = req.params;

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ healthId }, { projection: { _id: 0, password: 0 } });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(user);
  } catch (error) {
    console.error("❌ Error fetching user by HealthID:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Reset Password
router.post("/reset-password", async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "User ID and a valid password (min 6 characters) are required." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ userId });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await collection.updateOne({ userId }, { $set: { password: hashedPassword } });

    console.log(`✅ Password reset successful for ${userId}`);
    res.json({ message: "Password reset successful." });
  } catch (error) {
    console.error("❌ Error resetting password:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Delete User
router.delete("/delete/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await collection.deleteOne({ userId });

    console.log(`✅ User ${userId} deleted successfully.`);
    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "An error occurred while deleting the user." });
  }
});


// ✅ Get logged-in user info using token
router.get("/me", authenticateUser, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      userId: user.userId,
      healthId: user.healthId,
      email: user.email,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Server error" });
  }
});


module.exports = router;

