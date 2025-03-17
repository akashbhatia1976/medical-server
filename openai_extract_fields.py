import os
import json
import re
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from datetime import datetime
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
    """Clean up the extracted text for better OpenAI input."""
    try:
        cleaned_text = re.sub(r"Page \d+ of \d+|REGD\. OFFICE.*\n|Corporate Identity.*\n|^\*\*.*\*\*$", "", text, flags=re.MULTILINE)
        cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
        cleaned_text = re.sub(r"[-]{2,}", "", cleaned_text)
        cleaned_text = "\n".join(line.strip() for line in cleaned_text.split("\n") if len(line.strip()) > 10)
        log("Cleaned text for OpenAI input:")
        log(cleaned_text[:500])
        return cleaned_text
    except Exception as e:
        log(f"Error during text preprocessing: {e}")
        return text

def analyze_with_openai(text):
    """Send cleaned text to OpenAI and normalize the response."""
    try:
        prompt = (
            "Analyze the following medical report text and extract categories and parameters present in the report. "
            "Respond with a valid JSON format, starting with `{` and ending with `}`, with no extra characters."
        )
        data = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant specializing in medical diagnostics."},
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
        if not content:
            raise ValueError("Empty content in OpenAI response.")

        return json.loads(content)
    except requests.exceptions.RequestException as e:
        log(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        log(f"Error analyzing with OpenAI: {e}")
        return None

def save_output(parsed_data, output_file_path):
    """Save parsed data to JSON file with consistent structure."""
    try:
        standardized_output = {
            "success": bool(parsed_data and parsed_data.get("categories")),
            "categories": parsed_data.get("categories", []),
            "message": "Data extraction completed" if parsed_data.get("categories") else "No data extracted",
        }
        with open(output_file_path, 'w') as file:
            json.dump(standardized_output, file, indent=4)
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

    try:
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

        log("Saving extracted data...")
        save_output(openai_response, output_file_path)

        log("Process completed successfully.")
    except Exception as e:
        error_path = os.path.join(INTERMEDIATE_FOLDER, "error_output.json")
        with open(error_path, 'w') as error_file:
            json.dump({"error": str(e)}, error_file, indent=4)
        log(f"Error saved to: {error_path}")
        sys.exit(1)

if __name__ == "__main__":
    main()

