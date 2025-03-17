const AWS = require('aws-sdk');
const fs = require('fs');

// Configure AWS Textract
AWS.config.update({ region: 'us-east-1' }); // Replace with your region
const textract = new AWS.Textract();

// Function to extract text from a PDF
const extractTextFromPDF = async (filePath) => {
  try {
    // Read the file as binary
    const fileBytes = fs.readFileSync(filePath);

    // Call Textract
    const params = {
      Document: {
        Bytes: fileBytes,
      },
    };

    const result = await textract.detectDocumentText(params).promise();

    // Extract lines of text
    const extractedText = result.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text);

    return extractedText.join('\n'); // Join lines into a single string
  } catch (error) {
    console.error('Error extracting text with AWS Textract:', error.message);
    throw error;
  }
};

module.exports = { extractTextFromPDF };
