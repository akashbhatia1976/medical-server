const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const router = express.Router();
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB";
const collectionName = "reports";

// ✅ **Ensure 'uploads/' directory exists**
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📂 Created missing uploads directory: ${uploadDir}`);
}

// ✅ **Multer Storage Setup with Debugging**
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../uploads"); // 🔹 Ensure absolute path
      console.log(`🛠 Multer Destination Path: ${uploadPath}`);

      // ✅ **Check if folder exists**
      if (!fs.existsSync(uploadPath)) {
        console.log(`🚨 'uploads/' directory missing. Creating it now...`);
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      console.log(`📂 Multer received file: ${file.originalname}`);
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const sanitizedOriginalName = file.originalname.replace(/\s+/g, "_");
      const finalFileName = `${uniqueSuffix}-${sanitizedOriginalName}`;
      console.log(`📁 Generated Filename: ${finalFileName}`);
      cb(null, finalFileName);
    },
  }),
});


const uploadWithFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "userId", maxCount: 1 },
  { name: "reportId", maxCount: 1 },
]);

// ✅ **Upload Route**
router.post("/", uploadWithFields, async (req, res) => {
  console.log("🚀 Received POST request to `/api/upload`");
  console.log("📂 Checking req.files:", req.files);
  console.log("📂 Checking req.body:", req.body);

  let filePath = null;

  try {
    if (!req.files || !req.files.file || !req.files.file[0]) {
      console.error("🚨 Error: No file uploaded.");
      return res.status(400).json({ error: "File upload is required." });
    }

    filePath = req.files.file[0].path;
    console.log(`📁 File uploaded: ${filePath}`);

    const userId = (req.body.userId || "").trim();
    const reportId = (req.body.reportId || "").trim();

    if (!userId || !reportId) {
      console.error("🚨 Error: Missing userId or reportId.");
      return res.status(400).json({ error: "userId and reportId are required." });
    }

    console.log(`👤 User ID: ${userId}, 📊 Report ID: ${reportId}`);

    const outputFilePath = `openAI_output/${Date.now()}_${path.basename(filePath)}.json`;

    // ✅ **Execute Python Script**
    console.log(`🐍 Running Python script on: ${filePath}`);
    const pythonProcess = spawn("/Users/akashbhatia/medical-server/venv/bin/python3", [
      "openai_extract_fields_combined.py",
      filePath,
      outputFilePath,
    ]);

    pythonProcess.stdout.on("data", (data) => console.log(`🐍 Python stdout: ${data.toString()}`));
    pythonProcess.stderr.on("data", (data) => console.error(`🐍 Python stderr: ${data.toString()}`));

    pythonProcess.on("close", async (code) => {
      console.log(`🔄 Python script exited with code ${code}`);

      if (code !== 0 || !fs.existsSync(outputFilePath)) {
        console.error("🚨 Error: Processing failed.");
        return res.status(500).json({ error: "Processing failed." });
      }

      console.log(`✅ Processing complete. Output file: ${outputFilePath}`);

      let parsedData;
      try {
        parsedData = JSON.parse(fs.readFileSync(outputFilePath, "utf8"));
      } catch (parseError) {
        console.error("🚨 Error parsing OpenAI output JSON:", parseError);
        return res.status(500).json({ error: "Invalid JSON response from OpenAI." });
      }

      if (!parsedData || !parsedData.parameters) {
        console.error("🚨 Error: OpenAI response is missing required fields.");
        return res.status(500).json({ error: "Invalid response from OpenAI." });
      }

      try {
        await mongoClient.connect();
        const db = mongoClient.db(dbName);
        const collection = db.collection(collectionName);

        console.log("✅ Connected to MongoDB. Checking for user...");

        const userDoc = await collection.findOne({ userId });
        console.log("👤 User record found:", userDoc ? "Yes" : "No");

        // ✅ **Updated Report Schema Handling**
        const report = {
          reportId,
          date: new Date().toISOString(),
          patientInfo: parsedData.parameters["Patient Information"] || {},
          extractedParameters: parsedData.parameters["Medical Parameters"] || {},
          doctorNotes: parsedData.parameters["Doctor’s Notes"] || [],
        };

        if (!userDoc) {
          console.log("🆕 Inserting new user and report...");
          await collection.insertOne({ userId, reports: [report] });
        } else {
          console.log("🔄 Updating existing user with new report...");
          const updatedReports = userDoc.reports.filter((r) => r.reportId !== reportId).concat(report);
          await collection.updateOne({ userId }, { $set: { reports: updatedReports } });
        }

        console.log("✅ File processed and saved to database.");
        res.json({ message: "File processed successfully.", parsedData });
      } catch (dbError) {
        console.error("🚨 MongoDB Error:", dbError);
        return res.status(500).json({ error: "Database operation failed." });
      } finally {
        await mongoClient.close();
      }
    });
  } catch (error) {
    console.error("🚨 Error processing file:", error);
    res.status(500).json({ error: "An error occurred during processing." });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      console.log(`🧹 Cleaning up file: ${filePath}`);
      fs.unlinkSync(filePath);
    }
  }
});

module.exports = router;

