const express = require("express");
const { getDB } = require("../db");
const nodemailer = require("nodemailer");
require("dotenv").config();

const router = express.Router();
const collectionName = "shared_reports";
const reportsCollectionName = "reports"; // Ensure reports collection is correctly referenced

// ✅ Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Share a Report with a User (Family/Doctor) + Send Email Notification
router.post("/share-report", async (req, res) => {
  const { ownerId, sharedWith, reportId, permissionType } = req.body;

  if (!ownerId || !sharedWith || !reportId || !permissionType) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);

    // Check if the sharing record already exists
    const existingShare = await sharedCollection.findOne({ ownerId, sharedWith, reportId });

    if (existingShare) {
      return res.status(400).json({ error: "Report already shared with this user." });
    }

    const shareRecord = {
      ownerId,
      sharedWith,
      reportId,
      permissionType, // "view", "comment"
      sharedAt: new Date(),
    };

    await sharedCollection.insertOne(shareRecord);

    // Send Email Notification
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
        <p>Best Regards,<br>Aethral Medical App</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Report shared successfully and email sent!", data: shareRecord });
  } catch (error) {
    console.error("Error sharing report:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ✅ Share all Reports with a User (Family/Doctor) + Send Email Notification
router.post("/share-all", async (req, res) => {
  try {
    const { ownerId, sharedWith, permissionType } = req.body;

    if (!ownerId || !sharedWith || !permissionType) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const db = getDB();
    const reportsCollection = db.collection(reportsCollectionName);
    const sharedCollection = db.collection(collectionName);

    // Fetch all reports belonging to the owner
    const reports = await reportsCollection.find({ userId: ownerId }).toArray();

    if (!reports || reports.length === 0) {
      return res.status(404).json({ error: "No reports found for this user." });
    }

    // Prepare shared report entries
    const sharedReports = reports.map(report => ({
      ownerId,
      sharedWith,
      reportId: report.reportId,
      permissionType,
      sharedAt: new Date()
    }));

    // Insert into shared_reports collection
    await sharedCollection.insertMany(sharedReports);

    // Send Email Notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: sharedWith,
      subject: "All Medical Reports Have Been Shared with You",
      html: `
        <p>Dear User,</p>
        <p>All medical reports from <strong>${ownerId}</strong> have been shared with you.</p>
        <p>You can view them by logging into the app.</p>
        <p>Best Regards,<br>Aethral Medical App</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: "All reports shared successfully and email sent!", sharedReports });
  } catch (error) {
    console.error("Error sharing all reports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Revoke access to a shared report + Send Email Notification
router.post("/revoke", async (req, res) => {
  const { ownerId, reportId, sharedWith } = req.body;

  if (!ownerId || !reportId || !sharedWith) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const sharedCollection = db.collection(collectionName);

    // Delete the shared report entry
    const result = await sharedCollection.deleteOne({ ownerId, reportId, sharedWith });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "No matching shared report found." });
    }

    // Send Email Notification for Revocation
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: sharedWith,
      subject: "Medical Report Access Revoked",
      html: `
        <p>Dear User,</p>
        <p>Access to the medical report with ID <strong>${reportId}</strong> has been revoked by <strong>${ownerId}</strong>.</p>
        <p>If you believe this was a mistake, please contact ${ownerId}.</p>
        <p>Best Regards,<br>Aethral Medical App</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: `Access revoked for ${sharedWith} on report ${reportId} and email notification sent.` });
  } catch (error) {
    console.error("❌ Error revoking access:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;

