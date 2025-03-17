import os
import json
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF pages using Tesseract OCR."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            images = convert_from_path(pdf_path, output_folder=temp_dir, fmt='png')
            extracted_text = ""
            for image in images:
                extracted_text += pytesseract.image_to_string(image)
        return extracted_text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None

def analyze_text_with_openai(extracted_text, api_key):
    """Send the extracted text to OpenAI to analyze and extract parameters."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prompt = (
        "Extract key health parameters and their values from the following medical report:\n\n"
        f"{extracted_text}"
    )
    data = {
        "model": "gpt-4",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"Error analyzing text with OpenAI: {e}")
        return None

def save_to_database(parameters, report_date):
    """Save the extracted parameters and their values to MongoDB."""
    try:
        report_data = {
            "report_date": report_date,
            "parameters": parameters,
        }
        collection.insert_one(report_data)
        print(f"Parameters saved to database with report_date: {report_date}")
    except Exception as e:
        print(f"Error saving to database: {e}")

def save_extracted_text_to_file(extracted_text, folder="extracted_files"):
    """Save extracted text to a file in the specified folder."""
    if not os.path.exists(folder):
        os.makedirs(folder)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_path = os.path.join(folder, f"extracted_text_{timestamp}.txt")
    with open(file_path, "w") as text_file:
        text_file.write(extracted_text)
    print(f"Extracted text saved to {file_path}")
    return file_path

def main():
    # Get OpenAI API key from environment variables
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in .env file.")
        return

    # Prompt user for PDF file path
    pdf_path = input("Enter the path to the PDF file: ").strip()

    # Step 1: Extract text from the PDF
    print("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)
    if not extracted_text:
        print("Failed to extract text from PDF.")
        return

    # Save extracted text to a file
    extracted_text_file = save_extracted_text_to_file(extracted_text)

    # Step 2: Analyze text with OpenAI
    print("Analyzing text with OpenAI...")
    extracted_parameters = analyze_text_with_openai(extracted_text, api_key)
    if not extracted_parameters:
        print("Failed to analyze text with OpenAI.")
        return

    # Parse the JSON result (if OpenAI provides structured JSON output)
    try:
        parameters = json.loads(extracted_parameters)
    except json.JSONDecodeError:
        print("Failed to decode OpenAI response as JSON. Saving raw response...")
        parameters = {"raw_analysis": extracted_parameters}

    # Step 3: Save results to database
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_to_database(parameters, report_date)
    print("Process complete.")

if __name__ == "__main__":
    main()
