const mongoose = require("mongoose");

const SharedReportSchema = new mongoose.Schema({
  ownerId: { type: String, required: true }, // User who owns the reports
  sharedWith: [
    {
      userId: { type: String, required: true }, // User receiving access
      role: { type: String, enum: ["doctor", "family", "friend"], required: true }, // Role type
      permissions: [{ type: String, enum: ["view", "comment"] }] // Allowed actions
    }
  ],
  accessType: { type: String, enum: ["full", "partial"], required: true }, // Full: all reports, Partial: selected reports
  allowedReports: [{ type: String }], // List of report IDs if access is partial
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SharedReport", SharedReportSchema);
