// medical-server/routes/confidenceScoreRoutes.js
const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const ConfidenceScoreService = require('../services/confidenceScoring');
const authenticateUser = require('../middleware/authenticateUser');

const mongoClient = new MongoClient(process.env.MONGODB_URI);

// ✅ POST: Generate Confidence Score
router.post('/generate/:reportId', authenticateUser, async (req, res) => {
  try {
    const score = await ConfidenceScoreService.calculateConfidenceScoreById(req.params.reportId);
    const result = await ConfidenceScoreService.saveConfidenceScore(
      req.params.reportId,
      req.user.userId,
      score
    );

    res.json({ message: 'Confidence score generated successfully', data: result });
  } catch (error) {
    console.error('Confidence Score Generation Error:', error);
    res.status(500).json({ message: 'Error generating confidence score', error: error.message });
  }
});

// ✅ GET: Fetch Confidence Score
router.get('/:reportId', authenticateUser, async (req, res) => {
  try {
    const score = await ConfidenceScoreService.getConfidenceScoreByReportId(req.params.reportId);

    if (!score) {
      return res.status(404).json({ message: 'No confidence score found for this report' });
    }

    res.json({ message: 'Confidence score retrieved successfully', data: score });
  } catch (error) {
    console.error('Confidence Score Retrieval Error:', error);
    res.status(500).json({ message: 'Error retrieving confidence score', error: error.message });
  }
});

// ✅ POST: Submit Feedback
router.post('/feedback/:reportId', authenticateUser, async (req, res) => {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('medicalReportsDB');
    const feedbackCollection = db.collection('confidence_feedback');

    const feedback = {
      reportId: new ObjectId(req.params.reportId),
      userId: req.user.userId,
      confidenceScore: req.body.confidenceScore || null,
      reportFeedback: req.body.reportFeedback || null,
      parameterFeedback: req.body.parameterFeedback || [],
      userComment: req.body.userComment || '',
      timestamp: new Date()
    };

    await feedbackCollection.insertOne(feedback);

    res.json({ message: '✅ Feedback submitted successfully', data: feedback });
  } catch (error) {
    console.error('❌ Feedback Submission Error:', error);
    res.status(500).json({ error: 'Error submitting feedback' });
  }
});

module.exports = router;
