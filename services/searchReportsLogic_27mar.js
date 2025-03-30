const { getDB } = require('../db.js');

function buildMongoFilter(parsedFilters, userId) {
  const exprConditions = [];

  // Add userId match inside $expr
  exprConditions.push({ $eq: ["$userId", userId] });

  parsedFilters.forEach(filter => {
    const { parameterGroup, parameterName, condition, value } = filter;

    let operator;
    switch (condition.toLowerCase()) {
      case 'less than':
        operator = '$lt';
        break;
      case 'greater than':
        operator = '$gt';
        break;
      case 'equal to':
        operator = '$eq';
        break;
      case 'not equal to':
        operator = '$ne';
        break;
      default:
        operator = '$eq';
    }

    // Safely navigate nested fields with $getField + $convert
    const doubleValue = {
      $convert: {
        input: {
          $getField: {
            field: "Value",
            input: {
              $getField: {
                field: parameterName,
                input: {
                  $getField: {
                    field: parameterGroup,
                    input: "$extractedParameters"
                  }
                }
              }
            }
          }
        },
        to: "double",
        onError: null,
        onNull: null
      }
    };

    exprConditions.push({
      [operator]: [doubleValue, value]
    });
  });

  return {
    $expr: {
      $and: exprConditions
    }
  };
}

async function searchReportsWithFilters(userId, parsedFilters) {
  const db = await getDB();
  const reportsCollection = db.collection('reports');

  const mongoFilter = buildMongoFilter(parsedFilters, userId);

  console.log('\n🧠 MongoDB Filter:\n', JSON.stringify(mongoFilter, null, 2));

  const results = await reportsCollection.find(mongoFilter).toArray();

  console.log(`\n📄 Matched ${results.length} report(s):`);
  results.forEach(r => {
    console.log(`- ${r.filename || r._id}`);
  });

  return results.map(report => ({
    reportId: report._id,
    filename: report.filename,
    dateUploaded: report.createdAt || null,
    matchedParameters: parsedFilters.map(f => ({
      category: f.parameterGroup,
      field: f.parameterName,
    })),
  }));
}

module.exports = {
  searchReportsWithFilters,
};

