const express = require("express");
const { getDB } = require("../db");
const nodemailer = require("nodemailer");
const sendSMS = require("../services/smsService");
require("dotenv").config();
const authenticateUser = require("../middleware/authenticateUser");

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
router.post("/share-report", authenticateUser, async (req, res) => {
  const {
    ownerId,
    sharedWith,
    reportId,
    permissionType,
    recipientPhone,
    relationshipType = "Friend/Family", // Default
  } = req.body;

  // ✅ Normalize & trim sharedWith value
  const trimmedSharedWith = (sharedWith || "").trim().toLowerCase();

  console.log("📩 Incoming Share Request:", {
    ownerId,
    sharedWith,
    trimmedSharedWith,
    reportId,
    permissionType,
    recipientPhone,
    relationshipType,
  });

  // ✅ Validate required fields
  if (!ownerId || !trimmedSharedWith || !reportId || !permissionType) {
    console.warn("❌ Missing required fields:", {
      ownerId,
      trimmedSharedWith,
      reportId,
      permissionType,
    });
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
      $or: [
        { userId: trimmedSharedWith },
        { email: trimmedSharedWith },
      ],
    });
    console.log("🔍 existingUser:", existingUser);

    if (existingUser) {
      sharedWithId = existingUser.userId;
      sharedWithEmail = (existingUser.email || "").toLowerCase();
    } else {
      // Not a registered user — use email if it's an email, else store as-is
      if (trimmedSharedWith.includes("@")) {
        sharedWithEmail = trimmedSharedWith;
      } else {
        sharedWithId = trimmedSharedWith;
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
    io.emit("report-shared", {
      ownerId,
      sharedWithId,
      sharedWithEmail,
      reportId,
      permissionType,
    });

    res.json({
      message: "Report shared successfully! Email, SMS & In-App Notification sent.",
    });
  } catch (error) {
    console.error("❌ Error sharing report:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});


/// ✅ Share All Reports with a User
router.post("/share-all", authenticateUser, async (req, res) => {
  const { ownerId, sharedWith, permissionType = "view", relationshipType = "Friend/Family" } = req.body;

  // ✅ Validate required fields
  if (!ownerId || !sharedWith || !permissionType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // ✅ Normalize & lowercase sharedWith
  const normalizedSharedWith = sharedWith.trim().toLowerCase();

  try {
    const db = await getDB();
    const reports = await db.collection(reportsCollectionName).find({ userId: ownerId }).toArray();

    if (!reports.length) {
      return res.status(404).json({ error: "No reports found to share." });
    }

    // ✅ Normalize sharedWith to ID or email
    const usersCollection = db.collection(usersCollectionName);
    let sharedWithId = null;
    let sharedWithEmail = null;

    const existingUser = await usersCollection.findOne({
      $or: [{ userId: normalizedSharedWith }, { email: normalizedSharedWith }],
    });

    if (existingUser) {
      sharedWithId = existingUser.userId;
      sharedWithEmail = (existingUser.email || "").toLowerCase();
    } else {
      if (normalizedSharedWith.includes("@")) {
        sharedWithEmail = normalizedSharedWith;
      } else {
        sharedWithId = normalizedSharedWith;
      }
    }

    // ✅ Create share records
    const shareEntries = reports.map(report => ({
      ownerId,
      reportId: report._id.toString(),
      permissionType,
      relationshipType,
      sharedWithId,
      sharedWithEmail,
      sharedAt: new Date(),
    }));

    const result = await db.collection(collectionName).insertMany(shareEntries);

    // ✅ Optional Email Notification with summary
    if (sharedWithEmail) {
      const sharedReportsList = reports
        .map(r => `• ${r.name || r.fileName || 'Unnamed Report'} (${new Date(r.date).toDateString()})`)
        .join('<br>');

      const emailBody = `
        <p>Hello,</p>
        <p><strong>${ownerId}</strong> has shared all their medical reports with you on <strong>Aether</strong>.</p>
        <p>You now have access to <strong>${reports.length}</strong> report${reports.length > 1 ? 's' : ''}, including:</p>
        <p>${sharedReportsList}</p>
        <p>To view the reports, please log in or sign up at:<br>
        <a href="https://myaether.live">https://myaether.live</a></p>
        <p>If you weren’t expecting this, you can ignore this message.</p>
        <p>Stay healthy,<br>
        The Aether Health Team</p>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: sharedWithEmail,
        subject: "Medical Reports Shared with You",
        html: emailBody,
      };

      await transporter.sendMail(mailOptions);
    }

    console.log(`📤 Shared ${result.insertedCount} reports from ${ownerId} to ${sharedWithEmail || sharedWithId}`);
    res.json({ message: "All reports shared successfully", sharedCount: result.insertedCount });

  } catch (error) {
    console.error("❌ Error sharing all reports:", error);
    res.status(500).json({ error: "Failed to share all reports" });
  }
});



// ✅ Revoke Access
router.post("/revoke", authenticateUser, async (req, res) => {
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

// ✅ Share All Reports with a User
router.post("/share-all", authenticateUser, async (req, res) => {
  const { ownerId, sharedWith, permissionType = "view", relationshipType = "Friend/Family" } = req.body;

  if (!ownerId || !sharedWith || !permissionType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = await getDB();
    const reports = await db.collection(reportsCollectionName).find({ userId: ownerId }).toArray();

    if (!reports.length) {
      return res.status(404).json({ error: "No reports found to share." });
    }

    // ✅ Normalize sharedWith to ID or email
    const usersCollection = db.collection(usersCollectionName);
    let sharedWithId = null;
    let sharedWithEmail = null;

    const existingUser = await usersCollection.findOne({
      $or: [{ userId: sharedWith }, { email: sharedWith }],
    });

    if (existingUser) {
      sharedWithId = existingUser.userId;
      sharedWithEmail = existingUser.email;
    } else {
      if (sharedWith.includes("@")) {
        sharedWithEmail = sharedWith;
      } else {
        sharedWithId = sharedWith;
      }
    }

    // ✅ Create share records
    const shareEntries = reports.map(report => ({
      ownerId,
      reportId: report._id.toString(),
      permissionType,
      relationshipType,
      sharedWithId,
      sharedWithEmail,
      sharedAt: new Date(),
    }));

    const result = await db.collection(collectionName).insertMany(shareEntries);

    // ✅ Optional Email Notification with summary
    if (sharedWithEmail) {
      const sharedReportsList = reports
        .map(r => `• ${r.name || r.fileName || 'Unnamed Report'} (${new Date(r.date).toDateString()})`)
        .join('<br>');

      const emailBody = `
        <p>Hello,</p>
        <p><strong>${ownerId}</strong> has shared all their medical reports with you on <strong>Aether</strong>.</p>
        <p>You now have access to <strong>${reports.length}</strong> report${reports.length > 1 ? 's' : ''}, including:</p>
        <p>${sharedReportsList}</p>
        <p>To view the reports, please log in or sign up at:<br>
        <a href="https://myaether.live">https://myaether.live</a></p>
        <p>If you weren’t expecting this, you can ignore this message.</p>
        <p>Stay healthy,<br>
        The Aether Health Team</p>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: sharedWithEmail,
        subject: "Medical Reports Shared with You",
        html: emailBody,
      };

      await transporter.sendMail(mailOptions);
    }

    console.log(`📤 Shared ${result.insertedCount} reports from ${ownerId} to ${sharedWithEmail || sharedWithId}`);
    res.json({ message: "All reports shared successfully", sharedCount: result.insertedCount });

  } catch (error) {
    console.error("❌ Error sharing all reports:", error);
    res.status(500).json({ error: "Failed to share all reports" });
  }
});


module.exports = router;

