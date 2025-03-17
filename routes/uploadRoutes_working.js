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

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const sanitizedOriginalName = file.originalname.replace(/\s+/g, "_");
      cb(null, `${uniqueSuffix}-${sanitizedOriginalName}`);
    },
  }),
});

const uploadWithFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "userId", maxCount: 1 },
  { name: "reportId", maxCount: 1 },
]);

router.post("/", uploadWithFields, async (req, res) => {
  let filePath = null;

  try {
    if (!req.files || !req.files.file || !req.files.file[0]) {
      return res.status(400).json({ error: "File upload is required." });
    }

    filePath = req.files.file[0].path;
    const userId = (req.body.userId || "").trim();
    const reportId = (req.body.reportId || "").trim();

    if (!userId || !reportId) {
      return res.status(400).json({ error: "userId and reportId are required." });
    }

    const outputFilePath = `openAI_output/${Date.now()}_${path.basename(filePath)}.json`;

    const pythonProcess = spawn("/Users/akashbhatia/medical-server/venv/bin/python3", [
        "openai_extract_fields.py",
        filePath,
        outputFilePath,
      ]);


    pythonProcess.stderr.on("data", (data) => console.error(`Python stderr: ${data}`));

    pythonProcess.on("close", async (code) => {
      if (code !== 0 || !fs.existsSync(outputFilePath)) {
        return res.status(500).json({ error: "Processing failed." });
      }

      const parsedData = JSON.parse(fs.readFileSync(outputFilePath, "utf8"));

      await mongoClient.connect();
      const db = mongoClient.db(dbName);
      const collection = db.collection(collectionName);

      const userDoc = await collection.findOne({ userId });
      const report = { reportId, date: new Date().toISOString(), parameters: parsedData.categories || [] };

      if (!userDoc) {
        await collection.insertOne({ userId, reports: [report] });
      } else {
        const updatedReports = userDoc.reports.filter((r) => r.reportId !== reportId).concat(report);
        await collection.updateOne({ userId }, { $set: { reports: updatedReports } });
      }

      res.json({ message: "File processed successfully.", parsedData });
    });
  } catch (error) {
    res.status(500).json({ error: "An error occurred during processing." });
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

module.exports = router;

