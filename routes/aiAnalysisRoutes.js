const express = require("express");
const { getDB } = require("../db");
const analyzeWithAI = require("../services/analyzeWithAI");
const generateAnalysisPrompt = require("../prompts/generateAnalysisPrompt");

const router = express.Router();
const reportsCollection = "reports";

// ✅ Analyze a report using AI (OpenAI by default)
router.post("/analyze-report", async (req, res) => {
  const { userId, reportId, model = "openai" } = req.body;

  if (!userId || !reportId) {
    return res.status(400).json({ error: "Missing required fields: userId or reportId" });
  }

  try {
    const db = getDB();
    const reportsCol = db.collection(reportsCollection);

    const report = await reportsCol.findOne({ userId, reportId });
    if (!report) {
      return res.status(404).json({ error: "Report not found for the given user." });
    }

    const prompt = generateAnalysisPrompt(report);
    const aiResponse = await analyzeWithAI(prompt, model);

    res.json({ success: true, analysis: aiResponse });
  } catch (error) {
    console.error("❌ AI Analysis Error:", error);
    res.status(500).json({ error: "Failed to generate AI analysis." });
  }
});

module.exports = router;

