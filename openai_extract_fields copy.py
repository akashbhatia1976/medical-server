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

# Paths for folders and synonyms file
OUTPUT_FOLDER = "openAi_output"
RAW_TEXT_FOLDER = "raw_text_output"
INTERMEDIATE_FOLDER = "intermediate_outputs"
SYNONYMS_FILE = "data/synonyms.json"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(RAW_TEXT_FOLDER, exist_ok=True)
os.makedirs(INTERMEDIATE_FOLDER, exist_ok=True)

# File size threshold in MB
MAX_FILE_SIZE_MB = 10

def check_file_size(pdf_path):
    """Ensure the file size is within the allowed limit."""
    if os.path.getsize(pdf_path) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise ValueError(f"File size exceeds {MAX_FILE_SIZE_MB}MB. Please upload a smaller file.")

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF using Tesseract OCR."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            images = convert_from_path(pdf_path, output_folder=temp_dir, fmt='png')
            extracted_text = ""
            for image in images:
                extracted_text += pytesseract.image_to_string(image)

            # Save raw text for inspection
            raw_text_path = os.path.join(RAW_TEXT_FOLDER, os.path.basename(pdf_path).replace(".pdf", "_raw.txt"))
            with open(raw_text_path, 'w') as file:
                file.write(extracted_text)
            print(f"Raw text saved to: {raw_text_path}")
        return extracted_text
    except Exception as e:
        print(f"Error during text extraction: {e}")
        return None

def preprocess_text(text):
    """Clean up the extracted text for better OpenAI input."""
    try:
        cleaned_text = re.sub(r"Page \d+ of \d+|REGD\. OFFICE.*\n|Corporate Identity.*\n|^\*\*.*\*\*$", "", text, flags=re.MULTILINE)
        cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)
        cleaned_text = re.sub(r"[-]{2,}", "", cleaned_text)
        cleaned_text = "\n".join(line.strip() for line in cleaned_text.split("\n") if len(line.strip()) > 10)
        print("Cleaned text for OpenAI input:")
        print(cleaned_text[:500])
        return cleaned_text
    except Exception as e:
        print(f"Error during text preprocessing: {e}")
        return text

def extract_json_content(content):
    """Extract the valid JSON block from OpenAI's response content."""
    try:
        json_start = content.find("{")
        json_end = content.rfind("}")
        if json_start == -1 or json_end == -1:
            raise ValueError("No valid JSON block found in the response.")
        return content[json_start:json_end + 1]
    except Exception as e:
        print(f"Error extracting JSON content: {e}")
        return None

def analyze_with_openai(text):
    """Send cleaned text to OpenAI and get structured categories and parameters."""
    try:
        prompt = (
            "As a medical diagnostic expert, analyze the following medical report text and extract all categories and parameters "
            "present in the report. For each category, include all parameters, their values, and units. Respond in a valid JSON format."
        )
        data = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant specializing in medical diagnostics."},
                {"role": "user", "content": f"{prompt}\n\n{text}"},
            ],
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=HEADERS,
            json=data,
        )
        response.raise_for_status()
        raw_response = response.json()
        print("Raw OpenAI Response:", json.dumps(raw_response, indent=4))
        content = raw_response["choices"][0]["message"]["content"].strip()

        # Extract valid JSON block
        valid_json = extract_json_content(content)
        if not valid_json:
            raise ValueError("Failed to extract valid JSON from OpenAI response.")

        intermediate_output_path = os.path.join(INTERMEDIATE_FOLDER, "raw_openai_response.json")
        with open(intermediate_output_path, 'w') as intermediate_file:
            json.dump(raw_response, intermediate_file, indent=4)
        print(f"Raw OpenAI response saved to: {intermediate_output_path}")
        return valid_json
    except requests.exceptions.RequestException as e:
        print(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        print(f"Error while analyzing with OpenAI: {e}")
        return None

def save_output(parsed_data, pdf_path):
    """Save parsed data to JSON file."""
    try:
        base_name = os.path.basename(pdf_path).replace(".pdf", "")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(OUTPUT_FOLDER, f"{base_name}_{timestamp}.json")
        with open(output_path, 'w') as file:
            json.dump(parsed_data, file, indent=4)
        print(f"Output saved to: {output_path}")
    except Exception as e:
        print(f"Error saving output: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <file_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        # Check file size
        check_file_size(pdf_path)

        print("Extracting text from PDF...")
        extracted_text = extract_text_from_pdf(pdf_path)
        if not extracted_text:
            raise ValueError("Failed to extract text from PDF.")

        print("Preprocessing text...")
        cleaned_text = preprocess_text(extracted_text)

        print("Analyzing text with OpenAI...")
        openai_response = analyze_with_openai(cleaned_text)
        if not openai_response:
            raise ValueError("Failed to analyze text with OpenAI.")

        print("Parsing OpenAI response...")
        parsed_data = json.loads(openai_response)

        print("Saving extracted data...")
        save_output(parsed_data, pdf_path)

        print(json.dumps(parsed_data, indent=4))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

