import os
import json
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

# OpenAI API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

# Output folder for OpenAI results
OPENAI_OUTPUT_FOLDER = "openAi_output"
os.makedirs(OPENAI_OUTPUT_FOLDER, exist_ok=True)

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

def analyze_with_openai(text):
    """Use OpenAI to extract categories and parameters without values in a structured format."""
    try:
        prompt = (
            f"Extract only the categories and parameters from the following medical report in the "
            f"structured format shown below. Do not include any values:\n\n"
            f"Example Output:\n"
            f"RBC PARAMETERS:\n"
            f"- Haemoglobin\n"
            f"- RBC\n"
            f"- PCV\n"
            f"---\n\n"
            f"Input Report:\n{text}"
        )
        data = {
            "model": "gpt-4",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=HEADERS,
            json=data
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"Error while analyzing with OpenAI: {e}")
        return None

def parse_openai_response(response):
    """Parse OpenAI response to extract categories and fields."""
    try:
        lines = response.splitlines()
        parsed_data = {}
        current_category = None

        for line in lines:
            # Identify categories
            if line.endswith(":") and not line.startswith("-"):
                current_category = line[:-1]
                parsed_data[current_category] = []
            elif line.startswith("-"):
                field = line.split("-")[-1].strip()
                if current_category:
                    parsed_data[current_category].append(field)

        return parsed_data
    except Exception as e:
        print(f"Error parsing OpenAI response: {e}")
        return {}

def save_openai_output(response):
    """Save OpenAI output to a file."""
    try:
        file_name = "openAi_output.txt"
        file_path = os.path.join(OPENAI_OUTPUT_FOLDER, file_name)
        with open(file_path, 'w') as file:
            file.write(response)
        print(f"OpenAI output saved to {file_path}")
    except Exception as e:
        print(f"Error saving OpenAI output: {e}")

def save_to_database(parsed_data):
    """Save categories and fields to the database."""
    try:
        report_data = {
            "parameters": parsed_data
        }
        collection.insert_one(report_data)
        print(f"Parameters saved to the database.")
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
    analysis_result = analyze_with_openai(extracted_text)

    if not analysis_result:
        print("Failed to analyze text with OpenAI.")
        return

    # Save OpenAI output to file
    print("Saving OpenAI output to file...")
    save_openai_output(analysis_result)

    # Parse OpenAI response for categories and fields
    print("Parsing OpenAI response...")
    parsed_data = parse_openai_response(analysis_result)

    # Save results to the database
    print("Saving results to the database...")
    save_to_database(parsed_data)
    print("Process complete.")

if __name__ == "__main__":
    main()

