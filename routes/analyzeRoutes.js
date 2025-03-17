const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { analyzeWithLLM } = require("../services/llmService");

const router = express.Router();

// Configure multer for temporary file uploads
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), async (req, res) => {
  const llmType = req.body.llmType || "openai"; // Default to OpenAI if not specified
  const filePath = req.file.path;

  try {
    // Read the file content
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // Call the LLM service
    const analysis = await analyzeWithLLM(llmType, fileContent);

    // Delete the file after reading
    fs.unlinkSync(filePath);

    res.status(200).json({ analysis, llmType });
  } catch (error) {
    console.error("Error analyzing file:", error);
    res.status(500).json({ message: "Failed to analyze file", error: error.message });
  }
});

module.exports = router;

