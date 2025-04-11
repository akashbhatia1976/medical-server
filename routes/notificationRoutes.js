// 📁 routes/notificationRoutes.js
const express = require("express");
const { getDB } = require("../db");
const authenticateUser = require("../middleware/authenticateUser");

const router = express.Router();
const collectionName = "notifications";

// ✅ Create a new notification
router.post("/", authenticateUser, async (req, res) => {
  const { userId, type, message, reportId } = req.body;

  if (!userId || !type || !message) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const db = getDB();
    const notificationsCollection = db.collection(collectionName);

    const newNotification = {
      userId,
      type,
      message,
      reportId: reportId || null,
      seen: false,
      createdAt: new Date(),
    };

    await notificationsCollection.insertOne(newNotification);
    res.status(201).json({ message: "Notification created successfully" });
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Get all notifications for a user
router.get("/:userId", authenticateUser, async (req, res) => {
  const { userId } = req.params;

  try {
    const db = getDB();
    const notifications = await db.collection(collectionName)
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(notifications);
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ✅ Mark a notification as read
router.post("/mark-seen", authenticateUser, async (req, res) => {
  const { notificationId } = req.body;

  if (!notificationId) {
    return res.status(400).json({ error: "Missing notification ID." });
  }

  try {
    const db = getDB();
    const result = await db.collection(collectionName).updateOne(
      { _id: new require("mongodb").ObjectId(notificationId) },
      { $set: { seen: true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Notification not found or already seen." });
    }

    res.json({ message: "Notification marked as seen." });
  } catch (error) {
    console.error("❌ Error marking notification as seen:", error);
    res.status(500).json({ error: "Failed to mark notification as seen." });
  }
});

module.exports = router;
