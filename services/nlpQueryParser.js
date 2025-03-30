const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load synonym mappings
const synonymMap = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/synonyms.json"), "utf-8")
);

// Flatten synonym map
function flattenSynonyms(synonyms) {
  const flat = { parameters: {}, categories: {} };

  for (const category in synonyms) {
    flat.categories[category.toLowerCase()] = category;

    for (const param in synonyms[category]) {
      const variants = synonyms[category][param];

      if (typeof variants === "object" && !Array.isArray(variants)) {
        for (const subParam in variants) {
          flat.parameters[subParam.toLowerCase()] = subParam;
          variants[subParam].forEach((v) => {
            flat.parameters[v.toLowerCase()] = subParam;
          });
        }
      } else {
        flat.parameters[param.toLowerCase()] = param;
        variants.forEach((v) => {
          flat.parameters[v.toLowerCase()] = param;
        });
      }
    }
  }

  return flat;
}

const flatSynonyms = flattenSynonyms(synonymMap);

function normalizeTerm(term, type) {
  if (!term || typeof term !== "string") return { normalized: term, recognized: false };
  const lookup = flatSynonyms[type];
  const normalized = lookup[term.trim().toLowerCase()];
  return {
    normalized: normalized || term,
    recognized: !!normalized
  };
}

function getPastDateRange(monthsAgo) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsAgo);
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

function parseMonthYearPhrase(phrase) {
  try {
    // Check if the phrase is just a year like "2024"
    const yearOnlyMatch = phrase.match(/^\d{4}$/);
    if (yearOnlyMatch) {
      const year = parseInt(phrase);
      const startDate = new Date(year, 0, 1); // Jan 1
      const endDate = new Date(year, 11, 31); // Dec 31
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0]
      };
    }

    const date = new Date(phrase + ' 1'); // e.g., "October 2024" → Oct 1, 2024
    if (isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = date.getMonth();

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0]
    };
  } catch {
    return null;
  }
}

async function parseSearchQuery(queryText) {
  try {
    const prompt = `
You are an assistant that translates natural language medical queries into structured JSON filters.

Given the following user query:
"${queryText}"

Respond ONLY in the following JSON format:

{
  "parameter": "<medical parameter name>",
  "operator": "<comparison operator like '=', '<', '>', '<=', '>=', 'range'>",
  "value": "<number or range value, e.g., '13', or '12-15'>",
  "category": "<optional category, like 'CBC (Complete Blood Count)'>",
  "timeframeMonths": "<optional number of months to filter by date>"
}

Only include the fields that are relevant to the query. For example, if there’s no mention of a timeframe, omit the timeframeMonths field.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant for medical search query parsing." },
        { role: "user", content: prompt }
      ],
      temperature: 0,
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    console.log("\n🧠 Raw OpenAI Response:\n", raw);
    if (!raw) throw new Error("Empty response from OpenAI");

    const parsed = JSON.parse(raw);

    const isNumeric = !isNaN(parseInt(parsed.timeframeMonths));
    const months = parseInt(parsed.timeframeMonths);

    if (isNumeric && months > 0) {
      const { startDate, endDate } = getPastDateRange(months);
      parsed.dateRange = { startDate, endDate };
    } else if (typeof parsed.value === 'string') {
      const parsedDates = parseMonthYearPhrase(parsed.value);
      if (parsedDates) {
        // Handle if operator is < or > and value is a date-like phrase
        if (["<", "<="].includes(parsed.operator)) {
          parsed.dateRange = { startDate: null, endDate: parsedDates.startDate };
        } else if ([">", ">="].includes(parsed.operator)) {
          parsed.dateRange = { startDate: parsedDates.endDate, endDate: null };
        } else {
          parsed.dateRange = parsedDates;
        }
        console.log("🗓️ Interpreted date from value:", parsed.value, '→', parsed.dateRange);
        delete parsed.value; // Prevent treating date as numeric value
      } else {
        console.warn("⚠️ Could not interpret custom date phrase:", parsed.value);
      }
    } else if (parsed.timeframeMonths) {
      console.warn("⚠️ Ignoring non-positive or non-numeric timeframeMonths:", parsed.timeframeMonths);
    }

    if (parsed.parameter) {
      const normalizedParam = normalizeTerm(parsed.parameter, "parameters");
      parsed.parameter = normalizedParam.normalized;
      if (!normalizedParam.recognized) parsed.unrecognizedParameter = true;
    }

    if (parsed.category) {
      const normalizedCat = normalizeTerm(parsed.category, "categories");
      parsed.category = normalizedCat.normalized;
    }

    console.log("🔍 Parsed & Normalized Filters:", parsed);
    return parsed;
  } catch (err) {
    console.error("❌ Error parsing NLP query:", err);
    throw err;
  }
}

module.exports = { parseSearchQuery };

