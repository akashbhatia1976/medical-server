require("dotenv").config(); // Load environment variables
console.log("Environment Variables Loaded:", process.env); // Debugging log

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { MongoClient } = require("mongodb");
const { connectDB, closeDB } = require("./db");
const SharedReport = require("./models/SharedReport");


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
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = "medicalReportsDB"; // Ensured database name

// ✅ Ensure DB & Collections Exist on Startup
async function initializeDatabase() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");

    const db = mongoClient.db(dbName);
    const collections = await db.listCollections().toArray();
    const existingCollections = collections.map((col) => col.name);

    const requiredCollections = ["reports", "users", "parameters"];

    for (const collection of requiredCollections) {
      if (!existingCollections.includes(collection)) {
        await db.createCollection(collection);
        console.log(`✅ Created missing collection: ${collection}`);
      } else {
        console.log(`✅ Collection exists: ${collection}`);
      }
    }

    console.log("✅ Database initialization complete.");
  } catch (err) {
    console.error("❌ Database initialization error:", err);
    process.exit(1);
  }
}

// Debugging: Check if environment variables are loaded correctly
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Error: OPENAI_API_KEY is not set in the environment variables.");
} else {
  console.log("✅ OPENAI_API_KEY is loaded successfully.");
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Ensure required directories exist
["uploads", "processed", "comparison_results"].forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log(`✅ Created directory: ${dirPath}`);
  }
});

// ✅ Log All Registered Routes
const registeredRoutes = [
  { path: "/api/categories", handler: categoriesRoutes },
  { path: "/api/files", handler: filesRoutes },
  { path: "/api/dashboard", handler: dashboardRoutes },
  { path: "/api/trends", handler: trendsRoutes },
  { path: "/api/analyze", handler: analyzeRoutes },
  { path: "/api/upload", handler: uploadRoutes },
  { path: "/api/parameters", handler: parametersRoutes },
  { path: "/api/users", handler: usersRoutes },
  { path: "/api/reports", handler: reportsRoutes },
];

registeredRoutes.forEach(({ path, handler }) => {
  app.use(path, handler);
  console.log(`✅ Registered route: ${path}`);
});

// ✅ Health Check Route
app.get("/test", (req, res) => {
  res.json({ message: "✅ Server is running and responding!" });
});

// ✅ List All Available Routes
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    console.log(`🛠️ Route: ${middleware.route.path} | Methods: ${Object.keys(middleware.route.methods).join(", ")}`);
  }
});

// ✅ Start the Server After Database Initialization
initializeDatabase().then(() => {
  console.log("✅ Database & Collections Verified. Starting Server...");
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
});

// ✅ Clean Up & Close Database Connection on Server Exit
process.on("SIGINT", async () => {
  await closeDB();
  console.log("🔴 Database connection closed. Exiting server.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDB();
  console.log("🔴 Database connection closed. Exiting server.");
  process.exit(0);
});

