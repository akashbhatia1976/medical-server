require("dotenv").config(); // Load environment variables
console.log("Environment Variables Loaded:", process.env); // Debugging log
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { connectDB, closeDB } = require("./db");

// Import route files
const categoriesRoutes = require("./routes/categoriesRoutes");
const filesRoutes = require("./routes/filesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const trendsRoutes = require("./routes/trendsRoutes");
const analyzeRoutes = require("./routes/analyzeRoutes"); // Added analyze routes

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable for PORT if available

// Debugging: Check if environment variables are loaded correctly
if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in the environment variables.");
} else {
  console.log("OPENAI_API_KEY is loaded successfully.");
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure required directories exist
["uploads", "processed", "comparison_results"].forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
});

// Connect to MongoDB
connectDB()
  .then(() => {
    console.log("Connected to MongoDB");

    // Register routes
    app.use("/api", categoriesRoutes);
    app.use("/api", filesRoutes);
    app.use("/api", dashboardRoutes);
    app.use("/api", trendsRoutes);
    app.use("/api/analyze", analyzeRoutes); // Added analyze routes

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1); // Exit if the database connection fails
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

