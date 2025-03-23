const express = require("express");
const router = express.Router();
const db = require("../db");
const { analyzeWithAI, SupportedAIEngines } = require("../services/analyzeWithAI");

// ✅ Analyze a report using AI (OpenAI by default)
router.post("/analyze-report", async (req, res) => {
  const { userId, reportId, model = SupportedAIEngines.OPENAI } = req.body;

  if (!userId || !reportId) {
    return res.status(400).json({ error: "Missing required fields: userId or reportId" });
  }

  try {
    const reportsCollection = db.collection("reports");
    const report = await reportsCollection.findOne({ userId, reportId });

    if (!report || !report.extractedParameters) {
      return res.status(404).json({ error: "Report not found or missing extracted parameters" });
    }

    const parameters = report.extractedParameters;

    const analysis = await analyzeWithAI({
      promptType: "comprehensive",
      parameters,
      engine: model.toLowerCase(), // "openai", "claude", etc.
    });

    return res.json({ message: "AI analysis successful", analysis });
  } catch (error) {
    console.error("❌ AI Analysis Error:", error);
    return res.status(500).json({ error: "AI analysis failed", details: error.message });
  }
});

module.exports = router;

