const { OpenAI } = require("openai");

let openai;

try {
  // Initialize OpenAI client
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Load API key from environment variables
  });

  console.log("OpenAI API initialized successfully.");
} catch (error) {
  console.error("Error initializing OpenAI API:", error.message);
  process.exit(1); // Exit process on initialization failure
}

// Function to call OpenAI
const callOpenAI = async (prompt) => {
  if (!openai) {
    throw new Error("OpenAI API is not initialized.");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    // Validate the response structure
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("Invalid response from OpenAI API");
    }

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error calling OpenAI API:", error.message);
    throw error; // Re-throw for higher-level handling
  }
};

// Unified interface for LLMs
const analyzeWithLLM = async (llmType, prompt) => {
  if (llmType === "openai") {
    return await callOpenAI(prompt);
  } else {
    throw new Error(`Unsupported LLM type: ${llmType}`);
  }
};

module.exports = { analyzeWithLLM };

