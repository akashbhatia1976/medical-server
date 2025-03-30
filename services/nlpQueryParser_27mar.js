const axios = require('axios');

async function parseWithOpenAI(queryText) {
    const prompt = `
    You are an AI assistant for a medical report search system.

    Medical reports are stored in this format:
    extractedParameters → parameterGroup → parameterName → Value

    Examples:
    - extractedParameters["CBC (Complete Blood Count)"]["Haemoglobin"]["Value"] = "6.1"
    - extractedParameters["Liver Function Tests"]["SGOT (AST)"]["Value"] = "27.5"

    Given a user query, convert it into a structured filter array with the following format:

    [
      {
        "parameterGroup": "CBC (Complete Blood Count)",
        "parameterName": "Haemoglobin",
        "condition": "less than",
        "value": 12.0
      }
    ]

    Query: "${queryText}"
    Return only the filter array — no explanations.
    `;



  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = response.data.choices[0].message.content;

  console.log('\n🔍 Raw OpenAI Output:\n', result);

  try {
    const parsed = JSON.parse(result);
    console.log('\n✅ Parsed Filter JSON:\n', parsed);
    return parsed;
  } catch (err) {
    console.error('\n❌ Failed to parse OpenAI output:\n', result);
    throw new Error('Invalid response format from OpenAI');
  }
}


module.exports = {
  parseSearchQuery: parseWithOpenAI, // modular, can swap this later
};
