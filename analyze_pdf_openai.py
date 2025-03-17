import os
from pdf2image import convert_from_path
import pytesseract
import tempfile
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
import asyncio
import openai

# Load environment variables
load_dotenv()

# Retrieve OpenAI API Key and MongoDB URI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OpenAI API key is missing. Please set OPENAI_API_KEY in your .env file.")

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise ValueError("MongoDB URI is missing. Please set MONGO_URI in your .env file.")

# Set OpenAI API Key
openai.api_key = OPENAI_API_KEY

# MongoDB connection
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

def extract_text_from_pdf(pdf_path):
    """Convert PDF pages to text using Tesseract OCR."""
    try:
        with tempfile.TemporaryDirectory() as path:
            images = convert_from_path(pdf_path, output_folder=path, fmt='png')
            extracted_text = ""
            for image in images:
                extracted_text += pytesseract.image_to_string(image)
        return extracted_text
    except Exception as e:
        print(f"Error during text extraction: {e}")
        return None

async def analyze_with_openai(text):
    """Analyze the extracted text with OpenAI GPT."""
    try:
        response = await openai.ChatCompletion.acreate(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": f"Extract key health parameters from the following report:\n\n{text}"}
            ]
        )
        return response.choices[0].message["content"]
    except Exception as e:
        print(f"Error while analyzing with OpenAI: {e}")
        return None

def save_to_database(parameters, report_date):
    """Save the extracted parameters to the database."""
    try:
        report_data = {
            "report_date": report_date,
            "parameters": parameters
        }
        collection.insert_one(report_data)
        print(f"Parameters saved to the database with report_date: {report_date}")
    except Exception as e:
        print(f"Error saving to database: {e}")

def main():
    pdf_path = input("Enter the path to the PDF file: ").strip()

    # Extract text from the PDF
    print("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)

    if not extracted_text:
        print("Failed to extract text from PDF.")
        return

    # Analyze text with OpenAI
    print("Analyzing text with OpenAI...")
    import asyncio
    analysis_result = asyncio.run(analyze_with_openai(extracted_text))

    if not analysis_result:
        print("Failed to analyze text with OpenAI.")
        return

    # Save results to the database
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_to_database(analysis_result, report_date)
    print("Process complete.")

if __name__ == "__main__":
    main()

