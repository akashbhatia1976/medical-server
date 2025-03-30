// flattenParameters.js

const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const dbName = 'medicalReportsDB';

function flattenExtractedParameters(extracted) {
  const flatParams = [];

  for (const [key, value] of Object.entries(extracted || {})) {
    // Case 1: Flat parameter at root (e.g., Haemoglobin: { Value: 13 })
    if (value?.Value !== undefined && typeof value === 'object') {
      flatParams.push({
        category: null,
        name: key,
        value: parseFloat(value.Value) || null,
        unit: value.Unit || null,
        referenceRange: value['Reference Range'] || null
      });
    }

    // Case 2: Nested category (e.g., "Complete Blood Count": { Haemoglobin: { Value: 13 } })
    else if (typeof value === 'object') {
      for (const [paramName, paramDetails] of Object.entries(value)) {
        if (paramDetails?.Value !== undefined) {
          flatParams.push({
            category: key,
            name: paramName,
            value: parseFloat(paramDetails.Value) || null,
            unit: paramDetails.Unit || null,
            referenceRange: paramDetails['Reference Range'] || null
          });
        }
      }
    }
  }

  return flatParams;
}

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const reports = db.collection('reports');

    const cursor = reports.find({ extractedParameters: { $type: 'object' } });

    let scanned = 0;
    let updated = 0;

    while (await cursor.hasNext()) {
      const report = await cursor.next();
      scanned++;

      const flat = flattenExtractedParameters(report.extractedParameters);

      if (!flat.length) {
        console.log(`⚠️ Skipped report ${report._id} — no valid parameters found.`);
        continue;
      }

      const result = await reports.updateOne(
        { _id: report._id },
        { $set: { parameters: flat } }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Updated report ${report._id} with ${flat.length} parameters.`);
        updated++;
      } else {
        console.log(`ℹ️ No change for report ${report._id} (already up-to-date?)`);
      }
    }

    console.log(`\n🔍 Scanned ${scanned} reports`);
    console.log(`🎉 Done. Updated ${updated} report(s).`);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
}

main();

