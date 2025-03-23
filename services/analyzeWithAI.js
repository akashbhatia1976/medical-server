// services/analyzeWithAI.js

const OpenAI = require("openai");
require("dotenv").config();

// ✅ Setup OpenAI client (compatible with SDK v4.x)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Supported Engines (future extensibility)
const SupportedAIEngines = {
  OPENAI: "openai",
  CLAUDE: "claude",
  GROK: "grok",
};

// ✅ Modular AI Engine Selector
const analyzeWithAI = async ({ promptType, parameters, engine = SupportedAIEngines.OPENAI }) => {
  switch (engine) {
    case SupportedAIEngines.OPENAI:
      return await analyzeWithOpenAI(promptType, parameters);
    case SupportedAIEngines.CLAUDE:
      throw new Error("Claude support not implemented yet.");
    case SupportedAIEngines.GROK:
      throw new Error("Grok support not implemented yet.");
    default:
      throw new Error(`Unsupported AI engine: ${engine}`);
  }
};

// ✅ OpenAI Analysis Function
const analyzeWithOpenAI = async (promptType, parameters) => {
  if (!parameters || typeof parameters !== 'object' || Object.keys(parameters).length === 0) {
    return "⚠️ No parameters were provided for analysis. Please upload a report with extracted values.";
  }

  const formattedInput = Object.entries(parameters).map(([category, values]) => {
    const lineItems = Object.entries(values).map(
      ([key, val]) => `${key}: ${val?.Value || "N/A"} ${val?.Unit || ""}`
    ).join("\n");
    return `\nCategory: ${category}\n${lineItems}`;
  }).join("\n\n");

  const prompt = `You are a highly skilled medical assistant. Given the following diagnostic test results, provide a clear, structured, and actionable ${promptType} analysis. Focus on potential concerns, patterns, and suggestions for further investigation.\n\n${formattedInput}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful and knowledgeable medical assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "⚠️ No analysis returned.";
};


module.exports = {
  analyzeWithAI,
  SupportedAIEngines,
};

