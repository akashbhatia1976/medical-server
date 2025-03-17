const express = require("express");
const multer = require("multer");
const path = require("path");
const { getDB } = require("../db");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, JPG, PNG, and PDF files are allowed!"));
    }
  },
});

// File upload endpoint
router.post("/files/upload", upload.single("file"), async (req, res) => {
  const db = getDB();
  const filesCollection = db.collection("files");
  const { category } = req.body;

  // Log request details for debugging
  console.log("Request body:", req.body);
  console.log("Uploaded file:", req.file);

  // Validate category
  if (!category || category.trim() === "") {
    return res.status(400).json({ message: "Category is required" });
  }

  // Validate file
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const file = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      category,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedAt: new Date(),
    };

    await filesCollection.insertOne(file);
    console.log("File successfully uploaded:", file);

    res.status(201).json({ message: "File uploaded successfully", file });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Server error during file upload", error });
  }
});

// Get all files
router.get("/files", async (req, res) => {
  const db = getDB();
  const filesCollection = db.collection("files");

  try {
    const files = await filesCollection.find().toArray();
    res.status(200).json(files);
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).json({ message: "Failed to fetch files", error });
  }
});

// Endpoint to get files by category
router.get("/files/category/:category", async (req, res) => {
  const db = getDB();
  const filesCollection = db.collection("files");
  const { category } = req.params;

  try {
    const files = await filesCollection.find({ category }).toArray();
    if (files.length === 0) {
      return res.status(404).json({ message: "No files found for the specified category" });
    }
    res.status(200).json(files);
  } catch (error) {
    console.error("Error fetching files by category:", error);
    res.status(500).json({ message: "Failed to fetch files by category", error });
  }
});

// Delete file by ID
router.delete("/files/:id", async (req, res) => {
  const db = getDB();
  const filesCollection = db.collection("files");
  const { id } = req.params;

  try {
    const result = await filesCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "File not found" });
    }
    res.status(200).json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ message: "Failed to delete file", error });
  }
});

module.exports = router;

