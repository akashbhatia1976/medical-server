const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users"; // ✅ Corrected collection reference

// ✅ Check if a user exists
router.get("/exists/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection);

    const existingUser = await collection.findOne({ userId });

    res.json({ exists: !!existingUser });
  } catch (error) {
    console.error("❌ Error checking user existence:", error);
    res.status(500).json({ error: "An error occurred while checking user existence." });
  }
});

// ✅ Create a new user (Now correctly stored in `users` collection)
router.post("/", async (req, res) => {
  const { userId } = req.body;

  if (!userId || userId.includes(" ")) {
    return res.status(400).json({ error: "Invalid user ID. Spaces are not allowed." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection); // ✅ Corrected reference

    const existingUser = await collection.findOne({ userId });
    if (existingUser) {
      return res.status(400).json({ error: "User ID already exists." });
    }

    // ✅ Insert into `users` collection instead of `reports`
    await collection.insertOne({ userId, reports: [] });
    res.status(201).json({ message: "User created successfully.", userId });
  } catch (error) {
    console.error("❌ Error creating user:", error);
    res.status(500).json({ error: "An error occurred while creating the user." });
  }
});

// ✅ Get user details
router.get("/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection); // ✅ Corrected reference

    const user = await collection.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user });
  } catch (error) {
    console.error("❌ Error fetching user details:", error);
    res.status(500).json({ error: "An error occurred while fetching user details." });
  }
});

// ✅ Delete user and all associated reports
router.delete("/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(usersCollection); // ✅ Corrected reference

    const result = await collection.deleteOne({ userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "An error occurred while deleting the user." });
  }
});

module.exports = router;

