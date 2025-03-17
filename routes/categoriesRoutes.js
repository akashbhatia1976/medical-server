const express = require("express");
const { getDB } = require("../db");

const router = express.Router();

// Get all categories for a specific user
router.get("/:userId", async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);
  const db = getDB();
  const collection = db.collection("reports");

  try {
    // Query to get unique categories for the user
    const categories = await collection.aggregate([
      { $match: { userId } }, // Match userId
      { $unwind: "$reports" }, // Unwind the reports array
      { $unwind: "$reports.parameters.categories" }, // Unwind the categories array
      { $group: { _id: "$reports.parameters.categories.category" } }, // Group by unique category
    ]).toArray();

    // Format the response
    const formattedCategories = categories.map((item) => item._id).filter(Boolean); // Remove nulls if any

    if (formattedCategories.length === 0) {
      return res.status(404).json({ message: "No categories found for the user." });
    }

    res.status(200).json({ categories: formattedCategories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;

