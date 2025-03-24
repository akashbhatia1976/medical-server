console.log("✅ uploadRoutes.js is loaded...");

const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

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

const generateReportId = async (db, userId) => {
  const count = await db.collection(reportsCollection).countDocuments({ userId });
  return `report${(count + 1).toString().padStart(3, "0")}`;
};

// ✅ CORS Preflight
router.options("/", (req, res) => res.sendStatus(200));

// ✅ Main Upload Route
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { userId, reportDate, autoCreateUser } = req.body;
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

    const reportId = await generateReportId(db, userId);
    const outputFilePath = `openAI_output/${Date.now()}_${path.basename(filePath)}.json`;

    console.log("🚀 Starting Python script for file:", filePath);

    const pythonProcess = spawn("python3", [
      "openai_extract_fields_combined.py",
      filePath,
      outputFilePath,
    ]);

    // ✅ Catches Python spawn errors
    pythonProcess.on("error", (err) => {
      console.error("❌ Python process failed to start:", err);
      return res.status(500).json({ error: "Python script failed to start." });
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

      const reportData = {
        userId,
        reportId,
        date: new Date(reportDate),
        fileName: path.basename(filePath),
        extractedParameters: parsedData.parameters["Medical Parameters"],
      };

      await db.collection(reportsCollection).insertOne(reportData);

      await db.collection(usersCollection).updateOne(
        { userId },
        {
          $push: {
            reports: {
              reportId,
              date: new Date(reportDate),
              fileName: reportData.fileName,
            },
          },
        }
      );

      const healthId = user.healthId || `AETHER-${Math.floor(100000 + Math.random() * 900000)}`;
      const extractedParameters = parsedData.parameters["Medical Parameters"];

      if (extractedParameters) {
        const parameterEntries = [];

        for (const [category, tests] of Object.entries(extractedParameters)) {
          for (const [testName, details] of Object.entries(tests)) {
            parameterEntries.push({
              healthId,
              userId,
              reportId,
              category,
              testName,
              value: details.Value ?? null,
              referenceRange: details["Reference Range"] ?? null,
              unit: details.Unit ?? null,
              date: new Date(reportDate),
            });
          }
        }

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

