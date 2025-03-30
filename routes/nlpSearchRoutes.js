const express = require('express');
const router = express.Router();
const { parseSearchQuery } = require('../services/nlpQueryParser');
const { searchReportsWithFilters } = require('../services/searchReportsLogic');

router.post('/', async (req, res) => {
  try {
    const { userId, queryText } = req.body;
    if (!userId || !queryText) {
      return res.status(400).json({ error: 'userId and queryText are required' });
    }

    // Step 1: Parse query using OpenAI (or future model)
    const parsedFilters = await parseSearchQuery(queryText);

    // Step 2: Search reports using those filters
    const matchingReports = await searchReportsWithFilters(userId, parsedFilters);

    res.json({ success: true, reports: matchingReports });
  } catch (err) {
    console.error('Error in NLP Search:', err);
    res.status(500).json({ error: 'Something went wrong during search.' });
  }
});

module.exports = router;
