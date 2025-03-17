const path = require("path");
const { parseRelevantDetails } = require("../utils/pdfParser");

(async () => {
  try {
    // Path to your test PDF file
    const pdfFilePath = path.join(__dirname, "test-pdf.pdf");

    // Parse the PDF
    const parsedDetails = await parseRelevantDetails(pdfFilePath);

    // Log the parsed details
    console.log("Parsed Details:", parsedDetails);
  } catch (error) {
    console.error("Error during PDF parsing test:", error.message);
  }
})();
