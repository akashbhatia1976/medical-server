const express = require("express");
const router = express.Router();
const { addComment, getCommentsByReport, getCommentsByParameter } = require("../controllers/commentsController");

// POST a new comment
router.post("/", addComment);

// GET all comments for a report
router.get("/:reportId", getCommentsByReport);

// GET comments for a specific parameter (optional)
router.get("/:reportId/parameter/:parameterPath", getCommentsByParameter);

module.exports = router;
