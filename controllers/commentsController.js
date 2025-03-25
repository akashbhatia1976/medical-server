const { connectDB } = require("../db"); // Import connectDB from db.js

// Add a new comment to the report
const addComment = async (req, res) => {
  try {
    // Ensure DB connection is established before accessing the collection
    const db = await connectDB();  // Call connectDB to establish connection
    if (!db) {
      return res.status(500).json({ error: "Database connection failed." });
    }

    // Destructure the request body to extract comment data
    const {
      reportId,
      userId,
      sharedBy,
      commenterId,
      commentType,
      parameterPath,
      text,
    } = req.body;

    if (!reportId || !commenterId || !commentType || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create a new comment object
    const newComment = {
      reportId,
      userId,
      sharedBy,
      commenterId,
      commentType,
      parameterPath: commentType === "parameter" ? parameterPath : null,
      text,
      createdAt: new Date(),
    };

    // Insert the new comment into the comments collection
    const result = await db.collection("comments").insertOne(newComment);
    res.status(201).json({ message: "Comment added", commentId: result.insertedId });
  } catch (err) {
    console.error("❌ Error adding comment:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
};

// Get all comments for a specific report
const getCommentsByReport = async (req, res) => {
  try {
    const db = await connectDB();  // Call connectDB to establish connection
    if (!db) {
      return res.status(500).json({ error: "Database connection failed." });
    }

    const reportId = req.params.reportId;
    const comments = await db
      .collection("comments")
      .find({ reportId })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({ comments });
  } catch (err) {
    console.error("❌ Error fetching comments:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
};

// Get comments for a specific parameter in the report
const getCommentsByParameter = async (req, res) => {
  try {
    const db = await connectDB();  // Call connectDB to establish connection
    if (!db) {
      return res.status(500).json({ error: "Database connection failed." });
    }

    const { reportId, parameterPath } = req.params;
    const comments = await db
      .collection("comments")
      .find({ reportId, parameterPath })
      .sort({ createdAt: 1 })
      .toArray();

    res.json({ comments });
  } catch (err) {
    console.error("❌ Error fetching parameter comments:", err);
    res.status(500).json({ error: "Failed to fetch parameter comments" });
  }
};

module.exports = {
  addComment,
  getCommentsByReport,
  getCommentsByParameter,
};

