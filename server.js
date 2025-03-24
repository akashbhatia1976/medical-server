require("dotenv").config(); // Load environment variables
console.log("Environment Variables Loaded:", process.env); // Debugging log
console.log("🔍 Debug: MONGODB_URI =", process.env.MONGODB_URI); // Debugging log

const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const socketIo = require("socket.io"); // ✅ Import Socket.io
const cors = require("cors"); // ✅ Import CORS middleware
const mongoose = require("mongoose");



// ✅ Initialize Express App FIRST
const app = express();
const server = http.createServer(app);

// ✅ Add CORS Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:3001",              // local frontend dev
        "https://myaether.live",              // production domain
        "https://myaether.vercel.app",        // Vercel preview deploys
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Handle preflight OPTIONS requests for all routes
app.options("*", cors());


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
const shareRoutes = require("./routes/shareRoutes"); // ✅ Import the sharing routes
const aiAnalysisRoutes = require("./routes/aiAnalysisRoutes");

const io = socketIo(server, {
  cors: {
    origin: "*", // Change this to your frontend URL in production
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// ✅ MongoDB Connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit process with failure
  }
}

// ✅ Ensure DB & Collections Exist on Startup
async function initializeDatabase() {
  try {
    await connectDB(); // Ensure the connection and collections are created
    console.log("✅ Database & Collections Verified.");
  } catch (err) {
    console.error("❌ Database initialization error:", err);
    process.exit(1);
  }
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

// ✅ Register API Routes
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
  { path: "/api/share", handler: shareRoutes }, // ✅ New share functionality
  { path: "/api/ai-analysis", handler: aiAnalysisRoutes}
];

registeredRoutes.forEach(({ path, handler }) => {
  app.use(path, handler);
  console.log(`✅ Registered route: ${path}`);
});

// ✅ Setup Socket.io Connection
io.on("connection", (socket) => {
  console.log("🟢 A user connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 A user disconnected:", socket.id);
  });
});

// ✅ Make Socket.io available across routes
app.set("socketio", io);

app.get("/", (req, res) => {
  res.send("🚀 Medical Server is Live!");
});


// ✅ Health Check Route
app.get("/test", (req, res) => {
  res.json({ message: "✅ Server is running and responding!" });
});

// ✅ Start the Server After Database Initialization
initializeDatabase().then(() => {
  console.log("🚀 Starting Server...");
  server.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
  });
});

// ✅ Clean Up & Close Database Connection on Server Exit
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🔴 Database connection closed. Exiting server.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("🔴 Database connection closed. Exiting server.");
  process.exit(0);
});

