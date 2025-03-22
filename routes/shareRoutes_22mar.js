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
  const { ownerId, sharedWith, reportId, permissionType, recipientPhone } = req.body;

  if (!ownerId || !sharedWith || !reportId || !permissionType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const usersCollection = db.collection(usersCollectionName);
    const sharedCollection = db.collection(collectionName);
    const io = req.app.get("socketio");

    // ✅ Normalize sharedWith field (email or userId)
    let standardizedSharedWith = sharedWith;
    const existingUser = await usersCollection.findOne({
      $or: [{ email: sharedWith }, { userId: sharedWith }],
    });

    if (existingUser) {
      standardizedSharedWith = existingUser.email || existingUser.userId;
    }

    // ✅ Prevent duplicate shares
    const existingShare = await sharedCollection.findOne({ ownerId, sharedWith: standardizedSharedWith, reportId });

    if (existingShare) {
      return res.status(400).json({ error: "Report already shared with this user." });
    }

    // ✅ Insert new share record
    const shareRecord = {
      ownerId,
      sharedWith: standardizedSharedWith,
      reportId,
      permissionType,
      sharedAt: new Date(),
    };

    await sharedCollection.insertOne(shareRecord);

    // ✅ Send Email Notification (If Email Provided)
    if (sharedWith.includes("@")) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: sharedWith,
        subject: "A Medical Report Has Been Shared with You",
        html: `
          <p>Dear User,</p>
          <p>A medical report has been shared with you by <strong>${ownerId}</strong>.</p>
          <p>Report ID: <strong>${reportId}</strong></p>
          <p>Permission Type: <strong>${permissionType}</strong></p>
          <p>You can view this report by logging into the app.</p>
          <p>Best Regards,<br>Aether Medical App</p>
        `,
      };
      await transporter.sendMail(mailOptions);
    }

    // ✅ Send SMS Notification (If Phone Number Provided)
    if (recipientPhone) {
      const smsMessage = `📢 ${ownerId} has shared a medical report with you! Report ID: ${reportId}. Check the Aether app for details.`;
      await sendSMS(recipientPhone, smsMessage);
    }

    // ✅ Send In-App Notification
    io.emit("report-shared", { ownerId, sharedWith: standardizedSharedWith, reportId, permissionType });

    res.json({ message: "Report shared successfully! Email, SMS & In-App Notification sent." });
  } catch (error) {
    console.error("❌ Error sharing report:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Fetch Reports Shared **WITH** a User (Now Includes Full Report Details)
router.get("/shared-with/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);
    const reportsCollection = db.collection(reportsCollectionName);

    console.log("🔍 Fetching shared reports for:", userId);

    // ✅ Fetch only explicitly shared reports
    const sharedReports = await sharedCollection
      .find({ sharedWith: { $regex: new RegExp(`^${userId}$`, "i") } })
      .toArray();

    if (!sharedReports.length) {
      return res.status(200).json({ sharedReports: [] });
    }

    // ✅ Fetch full report details for shared report IDs
    const reportIds = sharedReports.map((report) => report.reportId);
    const fullReports = await reportsCollection.find({ reportId: { $in: reportIds } }).toArray();

    // ✅ Merge shared metadata with full report details
    const mergedReports = sharedReports.map((sharedReport) => {
      const fullReport = fullReports.find((report) => report.reportId === sharedReport.reportId);

      return {
        _id: sharedReport._id,
        reportId: sharedReport.reportId,
        ownerId: sharedReport.ownerId,
        sharedWith: sharedReport.sharedWith,
        permissionType: sharedReport.permissionType,
        sharedAt: sharedReport.sharedAt,
        fileName: fullReport?.fileName || "⚠️ Missing File",
        date: fullReport?.date || sharedReport.sharedAt,
        extractedParameters: fullReport?.extractedParameters || {}
      };
    });

    console.log("✅ Processed Shared Reports:", JSON.stringify(mergedReports, null, 2));

    res.json({ sharedReports: mergedReports });
  } catch (error) {
    console.error("❌ Error fetching shared reports:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Fetch Reports **Shared BY** a User
router.get("/shared-by/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);

    console.log("🔍 Fetching reports shared by:", userId);

    const sharedReports = await sharedCollection.find({ ownerId: { $regex: new RegExp(`^${userId}$`, "i") } }).toArray();

    console.log("✅ Found reports shared by user:", sharedReports);

    res.json({ sharedReports });
  } catch (error) {
    console.error("❌ Error fetching shared reports:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Revoke Access to a Shared Report
router.post("/revoke", async (req, res) => {
  const { ownerId, reportId, sharedWith, recipientPhone } = req.body;

  if (!ownerId || !reportId || !sharedWith) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);
    const io = req.app.get("socketio");

    console.log("🔍 Attempting to revoke access for:", { ownerId, reportId, sharedWith });

    let standardizedSharedWith = sharedWith;
    if (!sharedWith.includes("@")) {
      const existingUser = await db.collection(usersCollectionName).findOne({
        $or: [{ email: sharedWith }, { userId: sharedWith }],
      });

      if (existingUser) {
        standardizedSharedWith = existingUser.email || existingUser.userId;
      }
    }

    const result = await sharedCollection.deleteOne({ ownerId, reportId, sharedWith: standardizedSharedWith });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "No matching shared report found." });
    }

    console.log("✅ Report access revoked successfully.");
    io.emit("report-revoked", { ownerId, sharedWith: standardizedSharedWith, reportId });

    res.json({ message: "Access revoked successfully!" });
  } catch (error) {
    console.error("❌ Error revoking access:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;

