const { getDB } = require('../db.js');
const { ObjectId } = require('mongodb');

// 🧠 Safe regex utility
function safeRegex(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    console.warn("❌ Empty or invalid parameter for regex:", input);
    return null;
  }
  try {
    return new RegExp(input.trim(), 'i');
  } catch (e) {
    console.error("❌ Regex creation failed:", input, e);
    return null;
  }
}

async function searchReportsWithFilters(userId, parsedFilter) {
  const db = await getDB();
  const parametersCollection = db.collection('parameters');
  const reportsCollection = db.collection('reports');

  const mongoFilter = { userId: userId };

  // 📅 Date Range Filter (apply to parameters.date field)
  if (parsedFilter?.dateRange?.startDate || parsedFilter?.dateRange?.endDate) {
    mongoFilter.date = {};
    if (parsedFilter.dateRange.startDate)
      mongoFilter.date.$gte = new Date(parsedFilter.dateRange.startDate);
    if (parsedFilter.dateRange.endDate)
      mongoFilter.date.$lte = new Date(parsedFilter.dateRange.endDate);
  }

  // 🔍 Parameter Name (testName) with fallback logic
  if (parsedFilter?.parameter) {
    if (parsedFilter.unrecognizedParameter) {
      const regex = safeRegex(parsedFilter.parameter);
      if (regex) {
        mongoFilter.testName = { $regex: regex };
      } else {
        console.warn("⚠️ Invalid fallback regex, skipping testName match.");
      }
    } else {
      mongoFilter.testName = parsedFilter.parameter; // ✅ Exact match on normalized param
    }
  }

  // 🔢 Optional Value Filter
  const ops = { "<": "$lt", ">": "$gt", "<=": "$lte", ">=": "$gte", "=": "$eq" };
  const mongoOp = ops[parsedFilter.operator];
  if (mongoOp && parsedFilter.value !== undefined && parsedFilter.value !== "") {
    mongoFilter.value = {
      [mongoOp]: parseFloat(parsedFilter.value)
    };
  }

  console.log('\n🔍 MongoDB Filter:\n', JSON.stringify(mongoFilter, null, 2));

  // 🧾 Query parameters collection (filtering on parameters.date, not report date)
  const matchedParams = await parametersCollection.find(mongoFilter).toArray();
  console.log(`\n✅ Found ${matchedParams.length} parameter(s)`);

  // 🧠 Collect and filter reportIds
  const reportIds = [...new Set(matchedParams.map(p => p.reportId))].filter(Boolean);
  const validObjectIds = reportIds
    .filter(id => ObjectId.isValid(id))
    .map(id => new ObjectId(id));

  if (validObjectIds.length < reportIds.length) {
    console.warn(`⚠️ Skipped ${reportIds.length - validObjectIds.length} invalid reportId(s)`);
  }

  const reportsCursor = await reportsCollection
    .find({ _id: { $in: validObjectIds } })
    .toArray();

  const reportMap = {};
  reportsCursor.forEach(report => {
    reportMap[report._id.toString()] = {
      reportDate: report.date,
      fileName: report.fileName
    };
  });

  // 📦 Final Enriched Result
  const enrichedResults = matchedParams.map(p => {
    const reportInfo = reportMap[p.reportId?.toString()] || {};
    return {
      reportId: p.reportId,
      reportDate: reportInfo.reportDate || p.date || null,
      fileName: reportInfo.fileName || null,
      testName: p.testName,
      value: p.value,
      unit: p.unit,
      referenceRange: p.referenceRange,
      category: p.category,
      date: p.date
    };
  });

  return enrichedResults;
}

module.exports = {
  searchReportsWithFilters
};

