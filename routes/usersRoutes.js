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

  // ✅ Normalize email to lowercase for consistency
  const normalizedEmail = email?.toLowerCase().trim();

  if (!userId || userId.includes(" ") || !password || password.length < 6 || (!normalizedEmail && !phone)) {
    return res.status(400).json({ error: "Invalid input. Ensure User ID has no spaces, password is 6+ chars, and provide email/phone." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    // ✅ Filter only non-empty conditions
    const orConditions = [];
    if (userId) orConditions.push({ userId });
    if (normalizedEmail) orConditions.push({ email: normalizedEmail });
    if (phone) orConditions.push({ phone });

    const existingUser = await collection.findOne({ $or: orConditions });

    console.log("🧪 Checking user with conditions:", orConditions);
    console.log("🧪 Existing user match:", existingUser);

    if (existingUser) {
      const duplicateFields = [];
      if (existingUser.userId === userId) duplicateFields.push("User ID");
      if (existingUser.email === normalizedEmail) duplicateFields.push("Email");
      if (existingUser.phone === phone) duplicateFields.push("Phone");

      const msg = duplicateFields.length
        ? `Already exists: ${duplicateFields.join(", ")}`
        : "User already exists.";

      return res.status(400).json({ error: msg });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const healthId = generateHealthID();
    const verificationToken = normalizedEmail ? crypto.randomBytes(32).toString("hex") : null;
    const phoneVerificationToken = phone ? Math.floor(100000 + Math.random() * 900000).toString() : null;

    await collection.insertOne({
      userId,
      healthId,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      verified: false,
      verificationToken,
      phoneVerificationToken,
      createdAt: new Date(),
    });

    if (normalizedEmail) {
      try {
       const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

await transporter.sendMail({
  from: `"Aether Health" <${process.env.EMAIL_USER}>`,
  to: normalizedEmail,
  subject: "Verify Your Email - Aether Health",
  text: `
Welcome to Aether Health!

Thank you for registering with Aether Health. To complete your registration and access your account, please verify your email address by clicking on the following link:

${verificationLink}

If you didn't create an account with Aether Health, you can safely ignore this email.

© ${new Date().getFullYear()} Aether Health. All rights reserved.
`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0D9488; margin-bottom: 5px;">Aether Health</h1>
        <p style="color: #4b5563; font-size: 16px;">Your personal health records assistant</p>
      </div>
      
      <h2 style="color: #1F2937; text-align: center; margin-bottom: 20px;">Verify Your Email Address</h2>
      
      <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
        Thank you for registering with Aether Health! To complete your registration and access your account, please verify your email address by clicking the button below.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #0D9488; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px;">Verify Email Address</a>
      </div>
      
      <p style="color: #4b5563; font-size: 14px; margin-bottom: 10px;">
        If the button above doesn't work, copy and paste the following link into your browser:
      </p>
      
      <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px;">
        ${verificationLink}
      </p>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #6b7280; font-size: 14px;">
        <p>If you didn't create an account with Aether Health, you can safely ignore this email.</p>
        <p>&copy; ${new Date().getFullYear()} Aether Health. All rights reserved.</p>
      </div>
    </div>
  `
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

  // ✅ Normalize login input for case-insensitive email-based login
  const normalizedUserId = userId.toLowerCase().trim();

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    // ✅ Try finding user by userId OR email (both lowercase)
    const user = await collection.findOne({
      $or: [
        { userId: normalizedUserId },
        { email: normalizedUserId },
      ]
    });

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

    // ✅ Normalize userId from token if it's an email
    const rawUserId = req.user.userId;
    const normalizedUserId = rawUserId?.includes("@")
      ? rawUserId.toLowerCase().trim()
      : rawUserId?.trim();

    // ✅ Look up by either userId or email
    const user = await collection.findOne({
      $or: [{ userId: normalizedUserId }, { email: normalizedUserId }],
    });

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

  // ✅ Normalize userId if it's an email
  const normalizedUserId = userId?.includes("@") ? userId.toLowerCase().trim() : userId?.trim();

  if (!normalizedUserId || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "User ID and valid new password required." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    // ✅ Match either by userId or normalized email
    const user = await collection.findOne({
      $or: [{ userId: normalizedUserId }, { email: normalizedUserId }],
    });

    if (!user) return res.status(404).json({ error: "User not found." });

    const hashed = await bcrypt.hash(newPassword, saltRounds);
    await collection.updateOne(
      { _id: user._id },
      { $set: { password: hashed } }
    );

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

// ✅ Check if password reset is required
router.get("/reset-required/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const user = await collection.findOne({ userId });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Default to false if field doesn't exist
    const resetRequired = !!user.resetRequired;
    return res.json({ resetRequired });
  } catch (err) {
    console.error("❌ Error checking reset status:", err);
    res.status(500).json({ message: "Server error checking reset status." });
  }
});


module.exports = router;

