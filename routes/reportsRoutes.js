const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const authenticateUser = require("../middleware/authenticateUser");

const router = express.Router();

const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users";
const reportsCollection = "reports";
const sharedReportsCollection = "shared_reports";

// ✅ SECURED: Fetch a specific report for a user (owner or shared)
router.get("/:userId/:reportId", authenticateUser, async (req, res) => {
  const { reportId } = req.params;
  const requesterId = req.user.userId;

  try {
    console.log(`🔐 Request by user: ${requesterId} for report ${reportId}`);
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const reportObjectId = new ObjectId(reportId);

    // Check if user owns the report
    let report = await db.collection(reportsCollection).findOne({
      userId: requesterId,
      _id: reportObjectId,
    });

    if (!report) {
      // If not owner, check if it's shared
      const sharedAccess = await db.collection(sharedReportsCollection).findOne({
        reportId,
        sharedWith: requesterId,
      });

      if (!sharedAccess) {
        console.log(`🚫 Access denied for user: ${requesterId}, reportId: ${reportId}`);
        return res.status(403).json({ error: "Access denied. Report not shared with this user." });
      }

      // If shared, fetch the report by _id
      report = await db.collection(reportsCollection).findOne({ _id: reportObjectId });
      if (!report) {
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
router.delete("/:userId/:reportId", authenticateUser, async (req, res) => {
  const { reportId } = req.params;
  const userId = req.user.userId;
  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const reportObjectId = new ObjectId(reportId);
    const result = await db.collection(reportsCollection).deleteOne({ userId, _id: reportObjectId });
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
router.get("/categories/:userId", authenticateUser, async (req, res) => {
  const userId = req.user.userId;
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

// ✅ SECURED: Fetch all reports for a specific user
router.get("/:userId", authenticateUser, async (req, res) => {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.userId;

  console.log("🔐 Authenticated user:", authenticatedUserId);
  console.log("📥 Requested reports for:", requestedUserId);

  if (requestedUserId !== authenticatedUserId) {
    console.warn(`🚫 Unauthorized access attempt by ${authenticatedUserId} for ${requestedUserId}`);
    return res.status(403).json({ error: "Access denied." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const reports = await db.collection(reportsCollection)
      .find({ userId: requestedUserId })
      .project({ reportId: 1, fileName: 1, date: 1, aiAnalysis: 1 })
      .toArray();

    res.json(reports);
  } catch (error) {
    console.error("❌ Error fetching user reports:", error);
    res.status(500).json({ error: "Failed to retrieve reports." });
  }
});

// Add this new endpoint to your reportRoutes.js file



// ✅ SECURED: Fetch all reports with extracted parameters for timeline
router.get("/:userId/withParameters", authenticateUser, async (req, res) => {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.userId;

  console.log("🔐 Authenticated user:", authenticatedUserId);
  console.log("📥 Requested timeline data for:", requestedUserId);

  if (requestedUserId !== authenticatedUserId) {
    console.warn(`🚫 Unauthorized access attempt by ${authenticatedUserId} for ${requestedUserId}`);
    return res.status(403).json({ error: "Access denied." });
  }

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    // Get all reports for the user
    const reports = await db.collection(reportsCollection)
      .find({ userId: requestedUserId })
      .project({ _id: 1, fileName: 1, date: 1 }) // Just get the basic fields first
      .toArray();

    console.log(`Found ${reports.length} reports for user ${requestedUserId}`);
    
    // Fetch detailed reports one by one to get parameters
    const reportsWithParameters = [];
    
    for (const report of reports) {
      try {
        const detailedReport = await db.collection(reportsCollection).findOne({
          _id: report._id
        });
        
        if (detailedReport && detailedReport.extractedParameters) {
          // Create a new object with stringified _id to avoid MongoDB object issues
          reportsWithParameters.push({
            _id: detailedReport._id.toString(),
            reportId: detailedReport._id.toString(), // Add reportId for consistency
            fileName: detailedReport.fileName || "Unnamed Report",
            date: detailedReport.date,
            extractedParameters: detailedReport.extractedParameters
          });
        }
      } catch (err) {
        console.error(`Error processing report ${report._id}:`, err);
        // Continue with other reports
      }
    }

    console.log(`📊 Returning ${reportsWithParameters.length} reports with parameters for timeline`);
    res.json(reportsWithParameters);
  } catch (error) {
    console.error("❌ Error fetching timeline data:", error);
    res.status(500).json({ error: "Failed to retrieve timeline data." });
  }
});
module.exports = router;

