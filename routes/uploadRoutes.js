console.log("✅ uploadRoutes.js is loaded...");

const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const router = express.Router();
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const usersCollection = "users";
const reportsCollection = "reports";
const parametersCollection = "parameters";

// ✅ Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log(`📁 Created uploads directory at: ${uploadDir}`);
}

// ✅ Multer setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const sanitizedFilename = file.originalname.replace(/\s+/g, "_");
      cb(null, `${timestamp}-${sanitizedFilename}`);
    },
  }),
});

// ✅ Utilities
const getUser = async (db, userId) => await db.collection(usersCollection).findOne({ userId });

const createUser = async (db, userId) => {
  await db.collection(usersCollection).insertOne({ userId, reports: [] });
  console.log(`✅ Auto-created user: ${userId}`);
};

// ✅ CORS Preflight
router.options("/", (req, res) => res.sendStatus(200));

// ✅ Main Upload Route
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { userId, reportDate, autoCreateUser, reportName } = req.body;
    const filePath = req.file?.path;

    if (!userId || !reportDate || !filePath) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const db = mongoClient.db(dbName);
    let user = await getUser(db, userId);

    if (!user) {
      if (autoCreateUser === "true") {
        await createUser(db, userId);
        user = await getUser(db, userId);
      } else {
        return res.status(404).json({ error: "User not found." });
      }
    }

    const outputFilePath = `openAI_output/${Date.now()}_${path.basename(filePath)}.json`;

    console.log("🚀 Starting Python script for file:", filePath);

      const pythonProcess = spawn("python3", [
        "openai_extract_fields_combined.py",
        filePath,
        outputFilePath,
      ]);


      pythonProcess.on('error', (err) => {
        console.error("❌ Python process failed to start:", err);
        return res.status(500).json({ error: "Python script failed to start." }); // ✅ fixed
      });


    pythonProcess.stdout.on("data", (data) => {
      console.log(`🐍 Python stdout: ${data}`);
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error(`🐍 Python stderr: ${data}`);
    });

    pythonProcess.on("close", async (code) => {
      console.log("📦 Python script finished with code:", code);

      if (code !== 0) {
        return res.status(500).json({ error: "Python script failed." });
      }

      let parsedData;
      try {
        const rawOutput = fs.readFileSync(outputFilePath, "utf8");
        parsedData = JSON.parse(rawOutput);
      } catch (parseErr) {
        console.error("❌ Failed to parse OpenAI output:", parseErr);
        return res.status(500).json({ error: "Failed to parse OpenAI output." });
      }

    const topCategory = parsedData?.parameters?.[0]?.category || "Unnamed Report";
    const fallbackName = `${topCategory} – ${new Date(reportDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
        
      const reportData = {
        userId,
        date: new Date(reportDate),
        fileName: path.basename(filePath),
        name: reportName?.trim() || fallbackName,
        extractedParameters: parsedData.parameters,
      };

      const insertedReport = await db.collection(reportsCollection).insertOne(reportData);
      const reportId = insertedReport.insertedId; // ✅ MongoDB ObjectId

      await db.collection(usersCollection).updateOne(
        { userId },
        {
          $push: {
            reports: {
              reportId,
              date: new Date(reportDate),
              fileName: reportData.fileName,
              name: reportData.name, // ✅ Include name here too
            },
          },
        }
      );

      const healthId = user.healthId || `AETHER-${Math.floor(100000 + Math.random() * 900000)}`;
      const flattenedParameters = parsedData.parameters;

      if (flattenedParameters) {
        const parameterEntries = flattenedParameters.map(param => ({
          healthId,
          userId,
          reportId, // ✅ Use ObjectId
          category: param.category,
          testName: param.name,
          value: param.value,
          referenceRange: param.referenceRange,
          unit: param.unit,
          date: new Date(reportDate),
        }));

        if (parameterEntries.length > 0) {
          await db.collection(parametersCollection).insertMany(parameterEntries);
          console.log(`✅ Inserted ${parameterEntries.length} parameters into MongoDB.`);
        } else {
          console.warn("⚠️ No parameters found to insert.");
        }
      }

      res.json({ message: "File uploaded and processed successfully.", reportId });
    });
  } catch (err) {
    console.error("🚨 Error:", err);
    console.error("🔥 Upload failed at:", {
      userId: req.body?.userId,
      reportDate: req.body?.reportDate,
      filePath: req.file?.path,
    });
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;


