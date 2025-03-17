const pdf = require("pdf-parse");

/**
 * Parse the content of a PDF file.
 * @param {Buffer} pdfBuffer - The buffer containing the PDF file data.
 * @returns {Object} An object containing structured and relevant data extracted from the PDF.
 */
const parsePDF = async (pdfBuffer) => {
  try {
    const data = await pdf(pdfBuffer);

    // Raw text content from the PDF
    const rawText = data.text;

    // Customize this logic to extract relevant information
    const relevantDetails = extractRelevantDetails(rawText);

    return relevantDetails;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("Failed to parse PDF");
  }
};

/**
 * Extract relevant details from raw text content.
 * @param {string} rawText - The raw text extracted from the PDF.
 * @returns {Object} An object containing the parsed and structured information.
 */
const extractRelevantDetails = (rawText) => {
  // Example: Customize this logic based on the structure of your medical reports
  const lines = rawText.split("\n");
  const details = {};

  lines.forEach((line) => {
      if (line.includes("CID")) {
          details.patientCID = line.split(":")[1]?.trim();
    } else if (line.includes("Name")) {
      details.patientName = line.split(":")[1]?.trim();
    } else if (line.includes("Collected")) {
      details.collectDate = line.split(":")[1]?.trim();
    } else if (line.includes("Reported")) {
      details.reportDate = line.split(":")[1]?.trim();
    } else if (line.match(/(WBC|RBC|Platelets):/i)) {
      const [key, value] = line.split(":");
      details[key.trim()] = value?.trim();
    }
  });

  return details;
};

module.exports = { parsePDF };
