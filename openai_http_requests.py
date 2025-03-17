import os
import json
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pdf2image import convert_from_path
import pytesseract
import tempfile
from datetime import datetime

# Load environment variables
load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI")
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

def analyze_with_openai_http(extracted_text, api_key):
    """Analyze the extracted text using OpenAI's GPT model via HTTP request."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "gpt-4",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": f"Extract and summarize key health parameters from the following text:\n\n{extracted_text}"}
        ],
    }

    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data
        )
        response.raise_for_status()  # Raise an error if the request fails
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
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
    """Main function to run the parameter extraction and analysis."""
    pdf_path = input("Enter the path to the PDF file: ").strip()

    # Extract text from the PDF
    print("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)

    if not extracted_text:
        print("Failed to extract text from PDF.")
        return

    # Analyze text with OpenAI via HTTP request
    print("Analyzing text with OpenAI...")
    api_key = os.getenv("OPENAI_API_KEY")
    analysis_result = analyze_with_openai_http(extracted_text, api_key)

    if not analysis_result:
        print("Failed to analyze text with OpenAI.")
        return

    # Save results to the database
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_to_database(analysis_result, report_date)
    print("Process complete.")

if __name__ == "__main__":
    main()

