const express = require("express");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const authenticateUser = require("../middleware/authenticateUser");

const router = express.Router();

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users";
const saltRounds = 10;

// ✅ Twilio Setup
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

// ✅ Generate Health ID
const generateHealthID = () => `AETHER-${Math.floor(100000 + Math.random() * 900000)}`;

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

// ✅ Register a new user
router.post("/register", async (req, res) => {
  const { userId, email, phone, password } = req.body;
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
      return res.status(400).json({ error: `Already exists: ${duplicateFields.join(", ")}` });
    }

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

    if (email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Verify Your Email - Aether",
          text: `Click to verify: ${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`,
        });
      } catch (err) {
        console.warn("⚠️ Email not sent:", err.message);
      }
    }

    if (phone) {
      try {
        await twilioClient.messages.create({
          body: `Aether App code: ${phoneVerificationToken}`,
          from: TWILIO_PHONE_NUMBER,
          to: phone,
        });
      } catch (err) {
        console.warn("⚠️ SMS not sent:", err.message);
      }
    }

    res.status(201).json({ message: "User registered successfully.", healthId });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

// ✅ Verify email
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token required." });

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const user = await collection.findOne({ verificationToken: token });

    if (!user) return res.status(400).json({ error: "Invalid token." });

    await collection.updateOne({ verificationToken: token }, { $set: { verified: true, verificationToken: null } });
    res.json({ message: "Email verified. You may log in." });
  } catch (err) {
    console.error("❌ Email verification failed:", err);
    res.status(500).json({ error: "Internal error." });
  }
});

// ✅ Login and return JWT
router.post("/login", async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ error: "User ID and password required." });

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const user = await collection.findOne({ userId });

    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.verified) return res.status(403).json({ error: "Email/phone not verified." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Incorrect password." });

    const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: "2h" });

    res.json({
      message: "Login successful.",
      userId: user.userId,
      healthId: user.healthId,
      token,
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ error: "Server error during login." });
  }
});

// ✅ Get user info using token
router.get("/me", authenticateUser, async (req, res) => {
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const user = await collection.findOne({ userId: req.user.userId });

    if (!user) return res.status(404).json({ error: "User not found." });

    res.json({
      userId: user.userId,
      healthId: user.healthId,
      email: user.email,
    });
  } catch (err) {
    console.error("❌ Error fetching /me user:", err);
    res.status(500).json({ error: "Internal error fetching user." });
  }
});

// ✅ Reset password
router.post("/reset-password", async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "User ID and valid new password required." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);
    const user = await collection.findOne({ userId });

    if (!user) return res.status(404).json({ error: "User not found." });

    const hashed = await bcrypt.hash(newPassword, saltRounds);
    await collection.updateOne({ userId }, { $set: { password: hashed } });

    res.json({ message: "Password reset successful." });
  } catch (err) {
    console.error("❌ Password reset failed:", err);
    res.status(500).json({ error: "Error resetting password." });
  }
});

// ✅ Delete user
router.delete("/delete/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const result = await collection.deleteOne({ userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: "User not found." });

    res.json({ message: "User deleted successfully." });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ error: "Deletion failed." });
  }
});

module.exports = router;

