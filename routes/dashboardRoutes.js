const express = require("express");
const router = express.Router();

// Dashboard metrics endpoint
router.get("/dashboard-metrics", (req, res) => {
  res.status(200).json({
    totalFilesUploaded: 20,
    totalProcessedFiles: 15,
    highlights: {
      "High Cholesterol": 5,
      "High Blood Pressure": 3,
      "Normal Hemoglobin": 12,
    },
  });
});

module.exports = router;
