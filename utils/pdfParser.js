const { PDFDocument } = require("pdf-lib");
const nlp = require("compromise");
const fs = require("fs");

// Function to extract raw text from a PDF
async function extractTextFromPdf(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    let fullText = "";

    for (const page of pdfDoc.getPages()) {
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    console.log("Extracted Raw Text:", fullText);
    return fullText;
  } catch (error) {
    console.error("Error extracting text from PDF:", error.message);
    throw error;
  }
}

// Function to process the text using NLP
function extractRelevantDetails(rawText) {
  try {
    const doc = nlp(rawText);

    // Extract specific fields
    const name = doc.match("(Name|Full Name): *").after(":").out("text");
    const dob = doc.match("(Date of Birth|DOB): *").after(":").out("text");
    const age = doc.match("(Age|age): *").after(":").out("text");
    const hemoglobin = doc.match("(Hemoglobin): *").after(":").out("text"); // Example test
    const cholesterol = doc.match("(Cholesterol): *").after(":").out("text"); // Example test
    const RBC = doc.match("(RBC): *").after(":").out("text"); // Example test
    
      
    return {
      name: name.trim(),
      dob: dob.trim(),
      age: age.trim(),
      hemoglobin: hemoglobin.trim(),
      cholesterol: cholesterol.trim(),
      RBC: RBC.trim(),
    };
  } catch (error) {
    console.error("Error extracting relevant details:", error.message);
    throw error;
  }
}

// Main function to parse PDF and extract details
async function parsePdfAndExtractDetails(pdfPath) {
  try {
    const rawText = await extractTextFromPdf(pdfPath);
    const relevantDetails = extractRelevantDetails(rawText);
    return relevantDetails;
  } catch (error) {
    console.error("Error during parsing:", error.message);
    throw error;
  }
}

module.exports = { parsePdfAndExtractDetails };

