// medical-server/services/confidenceScoring.js
const { MongoClient, ObjectId } = require('mongodb');
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const dbName = 'medicalReportsDB';

class ConfidenceScoreService {
  static calculateConfidenceScore(report) {
    if (!report || !report.extractedParameters) {
      return {
        overallConfidence: 0,
        parameterConfidences: []
      };
    }

    const parameterConfidences = report.extractedParameters.map(param => {
      const expectedKeys = ['name', 'value', 'unit', 'referenceRange'];
      const presentKeys = [
        param.name ? 'name' : null,
        param.value !== undefined ? 'value' : null,
        param.unit ? 'unit' : null,
        param.referenceRange ? 'referenceRange' : null
      ].filter(Boolean);

      const completenessScore = (presentKeys.length / expectedKeys.length) * 40;

      let valueValidationScore = 0;
      let valueValidationIssues = [];

      if (param.value !== undefined && param.referenceRange) {
        try {
          const [low, high] = param.referenceRange.split('-').map(Number);
          const value = Number(param.value);

          if (isNaN(value)) {
            valueValidationScore = 0;
            valueValidationIssues.push('Invalid numeric value');
          } else if (value >= low && value <= high) {
            valueValidationScore = 30;
          } else {
            valueValidationScore = 15;
            valueValidationIssues.push('Value outside reference range');
          }
        } catch {
          valueValidationScore = 15;
          valueValidationIssues.push('Unable to parse reference range');
        }
      } else {
        valueValidationScore = 0;
        valueValidationIssues.push('Missing value or reference range');
      }

      let referenceRangeScore = 0;
      let referenceRangeIssues = [];

      if (param.referenceRange) {
        try {
          const [low, high] = param.referenceRange.split('-').map(Number);
          if (!isNaN(low) && !isNaN(high)) {
            referenceRangeScore = 20;
          } else {
            referenceRangeScore = 10;
            referenceRangeIssues.push('Non-numeric reference range');
          }
        } catch {
          referenceRangeScore = 10;
          referenceRangeIssues.push('Malformed reference range');
        }
      } else {
        referenceRangeScore = 0;
        referenceRangeIssues.push('No reference range provided');
      }

      const parameterConfidence = Math.min(
        completenessScore + valueValidationScore + referenceRangeScore,
        100
      );

      return {
        parameterName: param.name,
        confidence: parameterConfidence,
        completenessScore,
        valueValidationScore,
        referenceRangeScore,
        issues: [...valueValidationIssues, ...referenceRangeIssues]
      };
    });

    const overallConfidence = parameterConfidences.length > 0
      ? parameterConfidences.reduce((sum, param) => sum + param.confidence, 0) / parameterConfidences.length
      : 0;

    return { overallConfidence, parameterConfidences };
  }

  static async calculateConfidenceScoreById(reportId) {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const report = await db.collection('reports').findOne({ _id: new ObjectId(reportId) });

    if (!report) throw new Error('Report not found');

    return this.calculateConfidenceScore(report);
  }

  static async saveConfidenceScore(reportId, userId, score) {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    const confidenceScoresCollection = db.collection('confidence_scores');

    const confidenceScoreDoc = {
      reportId: new ObjectId(reportId),
      userId,
      overallConfidence: score.overallConfidence,
      parameterConfidences: score.parameterConfidences,
      createdAt: new Date()
    };

    return await confidenceScoresCollection.insertOne(confidenceScoreDoc);
  }

  static async getConfidenceScoreByReportId(reportId) {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);
    return await db.collection('confidence_scores').findOne({
      reportId: new ObjectId(reportId)
    });
  }
}

module.exports = ConfidenceScoreService;
