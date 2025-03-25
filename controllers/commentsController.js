const { getDb } = require("../db");

const addComment = async (req, res) => {
  try {
    const db = getDb();
    const {
      reportId,
      userId,
      sharedBy,
      commenterId,
      commentType,
      parameterPath,
      text
    } = req.body;

    if (!reportId || !commenterId || !commentType || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newComment = {
      reportId,
      userId,
      sharedBy,
      commenterId,
      commentType,
      parameterPath: commentType === "parameter" ? parameterPath : null,
      text,
      createdAt: new Date()
    };

    const result = await db.collection("comments").insertOne(newComment);
    res.status(201).json({ message: "Comment added", commentId: result.insertedId });
  } catch (err) {
    console.error("❌ Error adding comment:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
};

const getCommentsByReport = async (req, res) => {
  try {
    const db = getDb();
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

const getCommentsByParameter = async (req, res) => {
  try {
    const db = getDb();
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
  getCommentsByParameter
};
