const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users";
const reportsCollection = "reports";
const sharedReportsCollection = "shared_reports";

// ✅ Add a new report (stored in `reports` collection)
router.post("/", async (req, res) => {
  const { userId, report } = req.body;
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    // Ensure user exists before adding a report
    const userExists = await db.collection(usersCollection).findOne({ userId });
    if (!userExists) {
      return res.status(404).json({ error: "User not found." });
    }

    // Insert the report into `reports` collection
    const reportData = { userId, ...report };
    await db.collection(reportsCollection).insertOne(reportData);

    console.log(`✅ Report added successfully for user: ${userId}`);
    res.status(201).json({ message: "Report added successfully.", reportId: report.reportId });
  } catch (error) {
    console.error("🚨 Error adding report:", error);
    res.status(500).json({ error: "An error occurred while adding the report." });
  }
});

// ✅ Fetch all reports **owned by** or **shared with** a user
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    // Get reports owned by user
    const ownedReports = await db.collection(reportsCollection).find({ userId }).toArray();

    // Get reports shared with user
    const sharedReportIds = await db.collection(sharedReportsCollection)
      .find({ sharedWith: userId })
      .project({ reportId: 1, _id: 0 })
      .toArray();
    const sharedReportIdsList = sharedReportIds.map((r) => r.reportId);

    const sharedReports = await db.collection(reportsCollection)
      .find({ reportId: { $in: sharedReportIdsList } })
      .toArray();

    // Merge both owned and shared reports
    const allReports = [...ownedReports, ...sharedReports];

    if (allReports.length === 0) {
      console.log(`🚫 No reports found for user: ${userId}`);
      return res.status(404).json({ error: "No reports found for this user." });
    }

    console.log(`📑 Fetched ${allReports.length} reports for user: ${userId}`);
    res.json({ reports: allReports });
  } catch (error) {
    console.error("🚨 Error fetching reports:", error);
    res.status(500).json({ error: "An error occurred while fetching reports." });
  }
});

// ✅ Fetch a specific report for a user, including reports shared with them
router.get("/:userId/:reportId", async (req, res) => {
  const { userId, reportId } = req.params;
  try {
    console.log(`🔍 Fetching report for userId: ${userId}, reportId: ${reportId}`);
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    // ✅ First, check if user is the owner of the report
    let report = await db.collection(reportsCollection).findOne({ userId, reportId });

    if (!report) {
      console.log(`🚫 Report not found under userId: ${userId}, checking shared access...`);

      // ✅ If the report isn't found under the user's ownership, check if it was shared
      const sharedAccess = await db.collection(sharedReportsCollection).findOne({ reportId, sharedWith: userId });

      if (!sharedAccess) {
        console.log(`🚫 Access denied for user: ${userId}, reportId: ${reportId}`);
        return res.status(403).json({ error: "Access denied. Report not shared with this user." });
      }

      // ✅ Fetch the actual report now that we confirmed access
      report = await db.collection(reportsCollection).findOne({ reportId });

      if (!report) {
        console.log(`🚫 Report found in shared access but missing in reports collection.`);
        return res.status(404).json({ error: "Report not found." });
      }
    }

    console.log("✅ Report found:", JSON.stringify(report, null, 2));
    res.json(report);
  } catch (error) {
    console.error("🚨 Error fetching report details:", error);
    res.status(500).json({ error: "Failed to retrieve report details." });
  }
});

// ✅ Delete a specific report for a user
router.delete("/:userId/:reportId", async (req, res) => {
  const { userId, reportId } = req.params;
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const result = await db.collection(reportsCollection).deleteOne({ userId, reportId });
    if (result.deletedCount === 0) {
      console.log(`🚫 Report not found or already deleted: ${reportId} for user: ${userId}`);
      return res.status(404).json({ error: "Report not found or already deleted." });
    }

    console.log(`🗑️ Report ${reportId} deleted for user: ${userId}`);
    res.json({ message: "Report deleted successfully." });
  } catch (error) {
    console.error("🚨 Error deleting report:", error);
    res.status(500).json({ error: "An error occurred while deleting the report." });
  }
});

// ✅ Get all unique categories and their parameters for a user
router.get("/categories/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const categories = await db.collection(reportsCollection).aggregate([
      { $match: { userId } },
      { $project: { extractedParameters: 1 } },
      { $unwind: "$extractedParameters" },
      {
        $group: {
          _id: "$extractedParameters.category",
          parameters: { $addToSet: "$extractedParameters.parameter" },
        },
      },
      {
        $project: {
          category: "$_id",
          parameters: 1,
          _id: 0,
        },
      },
    ]).toArray();

    res.json(categories);
  } catch (error) {
    console.error("🚨 Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories." });
  }
});

module.exports = router;

