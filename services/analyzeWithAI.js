// services/analyzeWithAI.js

const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

// Future engines can be added here
const SupportedAIEngines = {
  OPENAI = "openai",
  CLAUDE = "claude",
  GROK = "grok",
}

// ✅ Modular AI Engine Selection
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

// ✅ Actual Call to OpenAI
const analyzeWithOpenAI = async (promptType, parameters) => {
  const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

  const formattedInput = Object.entries(parameters).map(([category, values]) => {
    const lineItems = Object.entries(values).map(
      ([key, val]) => `${key}: ${val?.Value || "N/A"} ${val?.Unit || ""}`
    ).join("\n");
    return `\nCategory: ${category}\n${lineItems}`;
  }).join("\n\n");

  const prompt = `You are a medical expert. Based on the following test results, provide a ${promptType} analysis:\n\n${formattedInput}`;

  const completion = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a helpful and knowledgeable medical assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return completion.data.choices[0]?.message?.content?.trim() || "⚠️ No analysis returned.";
};

module.exports = {
  analyzeWithAI,
  SupportedAIEngines,
};
