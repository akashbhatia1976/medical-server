const express = require("express");
const router = express.Router();
const { MongoClient, ObjectId } = require("mongodb");
const { analyzeWithAI } = require("../services/analyzeWithAI");

const mongoClient = new MongoClient(process.env.MONGODB_URI);

// ✅ Analyze a report using AI (OpenAI by default)
router.post("/analyze-report", async (req, res) => {
  const { userId, reportId, model = "openai" } = req.body;

  if (!userId || !reportId) {
    return res.status(400).json({ error: "Missing required fields: userId or reportId" });
  }

  try {
    const client = await mongoClient.connect();
    const db = client.db("medicalReportsDB");

    const reportObjectId = new ObjectId(reportId);

    const report = await db.collection("reports").findOne({
      userId,
      _id: reportObjectId,
    });

    if (!report || !report.extractedParameters) {
      return res.status(404).json({ error: "Report or extracted parameters not found" });
    }

    const parameters = report.extractedParameters;
      
    console.log("📦 Extracted Parameters:", JSON.stringify(parameters, null, 2));
    console.log("🚀 Calling analyzeWithAI with engine:", model.toLowerCase());


    const analysis = await analyzeWithAI({
      promptType: "comprehensive",
      parameters,
      engine: model.toLowerCase(),
    });

    await db.collection("reports").updateOne(
      { _id: reportObjectId },
      {
        $set: {
          aiAnalysis: analysis,
          lastAnalyzedAt: new Date(),
        },
      }
    );

    res.json({ message: "AI analysis completed", analysis });
  } catch (error) {
    console.error("❌ AI Analysis Error:", error);
    res.status(500).json({ error: "AI analysis failed", details: error.message });
  }
});

module.exports = router;

