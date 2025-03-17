import os
import json
import re
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from dotenv import load_dotenv
import sys

# Load environment variables
load_dotenv()

# OpenAI API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

# Paths for folders and files
SYNONYMS_PATH = "data/synonyms.json"
OUTPUT_FOLDER = "openAI_output"
RAW_TEXT_FOLDER = "raw_text_output"
INTERMEDIATE_FOLDER = "intermediate_outputs"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(RAW_TEXT_FOLDER, exist_ok=True)
os.makedirs(INTERMEDIATE_FOLDER, exist_ok=True)

# Load synonyms.json
try:
    with open(SYNONYMS_PATH, "r") as f:
        SYNONYMS = json.load(f)
except FileNotFoundError:
    print(json.dumps({"error": f"Synonyms file not found at {SYNONYMS_PATH}"}))
    sys.exit(1)

# Helper functions
def log(message):
    """Log messages to console."""
    print(message)

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF using Tesseract OCR."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            images = convert_from_path(pdf_path, output_folder=temp_dir, fmt='png')
            extracted_text = ""
            for image in images:
                extracted_text += pytesseract.image_to_string(image)
            raw_text_path = os.path.join(RAW_TEXT_FOLDER, os.path.basename(pdf_path).replace(".pdf", "_raw.txt"))
            with open(raw_text_path, 'w') as file:
                file.write(extracted_text)
            log(f"Raw text saved to: {raw_text_path}")
        return extracted_text
    except Exception as e:
        log(f"Error during text extraction: {e}")
        return None

def preprocess_text(text):
    """Clean up extracted text for better OpenAI input."""
    cleaned_text = re.sub(r"Page \d+ of \d+|REGD\. OFFICE.*\n|Corporate Identity.*\n|^\*\*.*\*\*$", "", text, flags=re.MULTILINE)
    cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
    cleaned_text = re.sub(r"[-]{2,}", "", cleaned_text)
    cleaned_text = "\n".join(line.strip() for line in cleaned_text.split("\n") if len(line.strip()) > 10)
    log("Cleaned text for OpenAI input:")
    log(cleaned_text[:500])
    return cleaned_text

def analyze_with_openai(text):
    """Send cleaned text to OpenAI and normalize the response."""
    try:
        prompt = (
            "Analyze the following medical report text and extract categories and parameters present in the report. "
            "Ensure 'Patient's Name' and 'Doctor's Notes' are always included. "
            "Use 'synonyms.json' for category standardization. "
            "Respond in JSON format."
        )
        data = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are an AI assistant specializing in medical diagnostics."},
                {"role": "user", "content": f"{prompt}\n\n{text}"},
            ],
            "temperature": 0,
            "max_tokens": 4096,
        }
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=HEADERS, json=data)
        response.raise_for_status()
        raw_json = response.json()
        log("Raw OpenAI Response:")
        log(json.dumps(raw_json, indent=4))
        content = raw_json.get("choices", [])[0].get("message", {}).get("content", "").strip()
        return json.loads(content) if content else None
    except requests.exceptions.RequestException as e:
        log(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        log(f"Error analyzing with OpenAI: {e}")
        return None

def validate_and_fix_response(parsed_response):
    """Ensure all required categories exist and normalize patient info."""
    if not parsed_response:
        return {
            "success": False,
            "categories": [],
            "parameters": {},
            "message": "No data extracted"
        }
    
    # Add missing categories
    required_categories = ["Patient Information", "Medical Parameters", "Doctor's Notes"]
    for category in required_categories:
        if category not in parsed_response:
            parsed_response[category] = {}

    # Normalize Patient Information fields
    patient_info = parsed_response.get("Patient Information", {})
    if "Name" in patient_info:
        patient_info["Patient's Name"] = patient_info.pop("Name")
    elif "Patient Name" in patient_info:
        patient_info["Patient's Name"] = patient_info.pop("Patient Name")
    if "Date" in patient_info:
        patient_info["Date of Examination"] = patient_info.pop("Date")
    parsed_response["Patient Information"] = patient_info
    
    return {
        "success": True,
        "categories": list(parsed_response.keys()),
        "parameters": parsed_response,
        "message": "Data extraction completed"
    }

def save_output(parsed_data, output_file_path):
    """Save parsed data to JSON file."""
    try:
        with open(output_file_path, 'w') as file:
            json.dump(parsed_data, file, indent=4)
        log(f"Output saved to: {output_file_path}")
    except Exception as e:
        log(f"Error saving output: {e}")
        sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python script.py <file_path> <output_file_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_file_path = sys.argv[2]

    log("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)
    if not extracted_text:
        raise ValueError("Failed to extract text from PDF.")
    
    log("Preprocessing text...")
    cleaned_text = preprocess_text(extracted_text)
    
    log("Analyzing text with OpenAI...")
    openai_response = analyze_with_openai(cleaned_text)
    if not openai_response:
        raise ValueError("Failed to analyze text with OpenAI.")
    
    log("Validating and standardizing output...")
    standardized_output = validate_and_fix_response(openai_response)
    
    log("Saving extracted data...")
    save_output(standardized_output, output_file_path)
    
    log("Process completed successfully.")

if __name__ == "__main__":
    main()
