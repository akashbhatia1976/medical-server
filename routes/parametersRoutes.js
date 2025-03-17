const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const collectionName = "reports";

router.get("/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const collection = db.collection(collectionName);

    const userDoc = await collection.findOne({ userId });

    if (!userDoc) {
      return res.status(404).json({ error: "User not found." });
    }

    const consolidatedParameters = {};

    userDoc.reports.forEach((report) => {
      Object.entries(report.parameters).forEach(([key, values]) => {
        if (!consolidatedParameters[key]) {
          consolidatedParameters[key] = [];
        }
        consolidatedParameters[key].push(...values);
      });
    });

    // Remove duplicates
    for (const key in consolidatedParameters) {
      consolidatedParameters[key] = [...new Set(consolidatedParameters[key])];
    }

    res.json({ userId, parameters: consolidatedParameters });
  } catch (error) {
    console.error("Error fetching parameters:", error);
    res.status(500).json({ error: "An error occurred while fetching parameters." });
  }
});

module.exports = router;
