const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const collectionName = "reports";

// Trends data endpoint
router.get("/:userId", async (req, res) => {
    const userId = decodeURIComponent(req.params.userId); // Handle spaces and special characters

    try {
        console.log(`Fetching trends for user: ${userId}`);

        await mongoClient.connect();
        const db = mongoClient.db(dbName);
        const collection = db.collection(collectionName);

        // Fetch all reports for the user
        const reports = await collection.find({ userId }).toArray();
        if (!reports.length) {
            return res.status(404).json({ error: "No reports found for this user." });
        }

        const trends = {};

        // Iterate through each report
        reports.forEach((report) => {
            const date = report.date;

            if (report.extractedParameters) {
                Object.entries(report.extractedParameters).forEach(([category, parameters]) => {
                    Object.entries(parameters).forEach(([paramName, paramValues]) => {
                        if (!trends[paramName]) {
                            trends[paramName] = [];
                        }
                        trends[paramName].push({
                            date,
                            Value: paramValues.Value || "N/A",
                            "Reference Range": paramValues["Reference Range"] || "N/A",
                            Unit: paramValues.Unit || "N/A",
                        });
                    });
                });
            }
        });

        console.log(`✅ Trends data for user ${userId}:`, trends);
        res.json({ userId, trends });

    } catch (error) {
        console.error("❌ Error fetching trends:", error);
        res.status(500).json({ error: "An error occurred while fetching trends." });
    }
});

module.exports = router;

