import os
import json
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime

# Load environment variables
load_dotenv()

# OpenAI API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

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
    """Use OpenAI to extract categories, parameters, and their values."""
    try:
        prompt = (
            f"Extract the categories, parameters, and their values from the following medical report in the "
            f"structured format shown below:\n\n"
            f"Example Output:\n"
            f"RBC PARAMETERS:\n"
            f"- Haemoglobin: 13.5 g/dL\n"
            f"- RBC: 4.5 million/uL\n"
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
    except KeyError as e:
        print(f"Unexpected response structure: {e}")
        return None

def save_to_database(parsed_data, user_id, date):
    """Save extracted data to MongoDB."""
    try:
        # Find the user's document or create a new one
        user_document = collection.find_one({"userId": user_id})

        if not user_document:
            user_document = {"userId": user_id, "reports": []}

        # Check if a report with the same date exists
        report = next((r for r in user_document["reports"] if r["date"] == date), None)

        if not report:
            # Create a new report if it doesn't exist
            report = {"date": date, "parameters": {}}
            user_document["reports"].append(report)

        # Update parameters in the report
        for parameter, value in parsed_data.items():
            if parameter not in report["parameters"]:
                report["parameters"][parameter] = []
            report["parameters"][parameter].extend(value)
            report["parameters"][parameter] = list(set(report["parameters"][parameter]))  # Remove duplicates

        # Update the user's document in the database
        collection.update_one(
            {"userId": user_id},
            {"$set": user_document},
            upsert=True
        )

        print(f"Data saved successfully for user {user_id} and date {date}.")
    except Exception as e:
        print(f"Error saving to database: {e}")

def parse_openai_response(response):
    """Parse the OpenAI response to extract structured data."""
    try:
        parsed_data = {}

        if not isinstance(response, str):
            raise ValueError("Response must be a string")

        lines = response.splitlines()
        current_category = None

        for line in lines:
            if line.endswith(":"):
                current_category = line[:-1]
                parsed_data[current_category] = []
            elif line.startswith("-") and current_category:
                parameter, _, value = line.partition(":")
                if parameter.strip() and value.strip():
                    parsed_data[current_category].append(value.strip())

        return parsed_data
    except Exception as e:
        print(f"Error parsing OpenAI response: {e}")
        return {}

def main():
    pdf_path = input("Enter the path to the PDF file: ").strip()
    user_id = input("Enter the user ID: ").strip()
    date = input("Enter the report date (YYYY-MM-DD): ").strip()

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

    # Parse the OpenAI response
    print("Parsing OpenAI response...")
    parsed_data = parse_openai_response(analysis_result)

    # Save parsed data to the database
    print("Saving data to the database...")
    save_to_database(parsed_data, user_id, date)

    print("Process complete.")

if __name__ == "__main__":
    main()
