const express = require("express");
const { getDB } = require("../db");
const nodemailer = require("nodemailer");
const sendSMS = require("../services/smsService");
require("dotenv").config();

const router = express.Router();
const collectionName = "shared_reports";
const usersCollectionName = "users";
const reportsCollectionName = "reports"; // Reference to reports collection

// ✅ Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Share a Report with a User
router.post("/share-report", async (req, res) => {
  const {
    ownerId,
    sharedWith,
    reportId,
    permissionType,
    recipientPhone,
    relationshipType = "Friend/Family" // Default
  } = req.body;

  if (!ownerId || !sharedWith || !reportId || !permissionType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const usersCollection = db.collection(usersCollectionName);
    const sharedCollection = db.collection(collectionName);
    const io = req.app.get("socketio");

    // ✅ Normalize sharedWithId and sharedWithEmail
    let sharedWithId = null;
    let sharedWithEmail = null;

    const existingUser = await usersCollection.findOne({
      $or: [{ userId: sharedWith }, { email: sharedWith }],
    });

    if (existingUser) {
      sharedWithId = existingUser.userId;
      sharedWithEmail = existingUser.email;
    } else {
      // Not a registered user — use email if it's an email, else store as-is
      if (sharedWith.includes("@")) {
        sharedWithEmail = sharedWith;
      } else {
        sharedWithId = sharedWith;
      }
    }

    // ✅ Prevent duplicate shares
    const existingShare = await sharedCollection.findOne({
      ownerId,
      reportId,
      $or: [
        { sharedWithId: sharedWithId || null },
        { sharedWithEmail: sharedWithEmail || null },
      ],
    });

    if (existingShare) {
      return res.status(400).json({ error: "Report already shared with this user." });
    }

    // ✅ Insert share record
    const shareRecord = {
      ownerId,
      reportId,
      permissionType,
      sharedWithId,
      sharedWithEmail,
      relationshipType,
      recipientPhone,
      sharedAt: new Date(),
    };

    await sharedCollection.insertOne(shareRecord);

    // ✅ Send Email Notification
    if (sharedWithEmail) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: sharedWithEmail,
        subject: "A Medical Report Has Been Shared with You",
        html: `
          <p>Dear User,</p>
          <p><strong>${ownerId}</strong> has shared a medical report with you.</p>
          <p>Report ID: <strong>${reportId}</strong></p>
          <p>Relationship Type: <strong>${relationshipType}</strong></p>
          <p>You can view this report by logging into the app.</p>
        `,
      };
      await transporter.sendMail(mailOptions);
    }

    // ✅ Send SMS Notification
    if (recipientPhone) {
      const smsMessage = `📢 ${ownerId} has shared a medical report with you! Report ID: ${reportId}. Check the Aether app for details.`;
      await sendSMS(recipientPhone, smsMessage);
    }

    // ✅ Emit In-App Notification
    io.emit("report-shared", { ownerId, sharedWithId, sharedWithEmail, reportId, permissionType });

    res.json({ message: "Report shared successfully! Email, SMS & In-App Notification sent." });
  } catch (error) {
    console.error("❌ Error sharing report:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Get Reports Shared WITH User
router.get("/shared-with/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);
    const reportsCollection = db.collection(reportsCollectionName);

    const user = await db.collection(usersCollectionName).findOne({ userId });

    const sharedReports = await sharedCollection
      .find({
        $or: [
          { sharedWithId: userId },
          ...(user?.email ? [{ sharedWithEmail: user.email }] : []),
        ],
      })
      .toArray();

    if (!sharedReports.length) {
      return res.status(200).json({ sharedReports: [] });
    }

    const reportIds = sharedReports.map((report) => report.reportId);
    const fullReports = await reportsCollection.find({ reportId: { $in: reportIds } }).toArray();

    const merged = sharedReports.map((share) => {
      const full = fullReports.find((r) => r.reportId === share.reportId);
      return {
        _id: share._id,
        reportId: share.reportId,
        ownerId: share.ownerId,
        permissionType: share.permissionType,
        sharedAt: share.sharedAt,
        sharedWithId: share.sharedWithId,
        sharedWithEmail: share.sharedWithEmail,
        relationshipType: share.relationshipType || "Unknown",
        fileName: full?.fileName || "⚠️ Missing File",
        date: full?.date || share.sharedAt,
        extractedParameters: full?.extractedParameters || {},
      };
    });

    res.json({ sharedReports: merged });
  } catch (error) {
    console.error("❌ Error fetching shared reports:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Get Reports Shared BY User
router.get("/shared-by/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);

    const sharedReports = await sharedCollection
      .find({ ownerId: userId })
      .toArray();

    res.json({ sharedReports });
  } catch (error) {
    console.error("❌ Error fetching shared-by reports:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Revoke Access
router.post("/revoke", async (req, res) => {
  const { ownerId, reportId, sharedWithId, sharedWithEmail } = req.body;

  if (!ownerId || !reportId || (!sharedWithId && !sharedWithEmail)) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);
    const io = req.app.get("socketio");

    const result = await sharedCollection.deleteOne({
      ownerId,
      reportId,
      $or: [
        ...(sharedWithId ? [{ sharedWithId }] : []),
        ...(sharedWithEmail ? [{ sharedWithEmail }] : []),
      ],
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "No matching shared report found." });
    }

    io.emit("report-revoked", { ownerId, sharedWithId, sharedWithEmail, reportId });
    res.json({ message: "Access revoked successfully!" });
  } catch (error) {
    console.error("❌ Error revoking report:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;

