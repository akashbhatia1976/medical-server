require("dotenv").config(); // Load environment variables
console.log("Environment Variables Loaded:", process.env); // Debugging log

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { connectDB, closeDB } = require("./db");

// Import route files
const categoriesRoutes = require("./routes/categoriesRoutes");
const filesRoutes = require("./routes/filesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const trendsRoutes = require("./routes/trendsRoutes");
const analyzeRoutes = require("./routes/analyzeRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const parametersRoutes = require("./routes/parametersRoutes");
const usersRoutes = require("./routes/usersRoutes");
const reportsRoutes = require("./routes/reportsRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Debugging: Check if environment variables are loaded correctly
if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in the environment variables.");
} else {
  console.log("OPENAI_API_KEY is loaded successfully.");
}

// Middleware (Ensure middleware is registered before routes)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Ensure required directories exist
["uploads", "processed", "comparison_results"].forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log(`Created directory: ${dirPath}`);
  }
});

// MongoDB connection and server startup
connectDB()
  .then(() => {
    console.log("Connected to MongoDB");

    // Register routes with debugging
    console.log("Registering routes...");
    app.use("/api/categories", categoriesRoutes);
    console.log("Registered /api/categories route.");

    app.use("/api/files", filesRoutes);
    console.log("Registered /api/files route.");

    app.use("/api/dashboard", dashboardRoutes);
    console.log("Registered /api/dashboard route.");

    app.use("/api/trends", trendsRoutes);
    console.log("Registered /api/trends route.");

    app.use("/api/analyze", analyzeRoutes);
    console.log("Registered /api/analyze route.");

    app.use("/api/upload", uploadRoutes);
    console.log("Registered /api/upload route.");

    app.use("/api/parameters", parametersRoutes);
    console.log("Registered /api/parameters route.");

    // Place routes that depend on parsed req.body after middleware
    app.use("/api/users", usersRoutes);
    console.log("Registered /api/users route.");

    app.use("/api/reports", reportsRoutes);
    console.log("Registered /api/reports route.");

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });

// Clean up and close database connection on server exit
process.on("SIGINT", async () => {
  await closeDB();
  console.log("Database connection closed. Exiting server.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDB();
  console.log("Database connection closed. Exiting server.");
  process.exit(0);
});

