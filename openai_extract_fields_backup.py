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

# Output folders
OUTPUT_FOLDER = "openAi_output"
RAW_TEXT_FOLDER = "raw_text_output"
INTERMEDIATE_FOLDER = "intermediate_outputs"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(RAW_TEXT_FOLDER, exist_ok=True)
os.makedirs(INTERMEDIATE_FOLDER, exist_ok=True)

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
        # Remove headers, footers, and unnecessary lines
        cleaned_text = re.sub(r"Page \d+ of \d+|REGD\. OFFICE.*\n|Corporate Identity.*\n|^\*\*.*\*\*$", "", text, flags=re.MULTILINE)
        cleaned_text = re.sub(r"\s{2,}", " ", cleaned_text)  # Replace multiple spaces with a single space
        cleaned_text = re.sub(r"[-]{2,}", "", cleaned_text)  # Remove excessive dashes
        cleaned_text = "\n".join(line.strip() for line in cleaned_text.split("\n") if len(line.strip()) > 10)

        print("Cleaned text for OpenAI input:")
        print(cleaned_text[:500])  # Preview cleaned text
        return cleaned_text
    except Exception as e:
        print(f"Error during text preprocessing: {e}")
        return text

def analyze_with_openai(text):
    """Send cleaned text to OpenAI and get structured categories and parameters."""
    try:
        prompt = (
            f"As a medical diagnostic expert, extract all categories and parameters from the following medical report:\n\n"
            f"{text}\n\n"
            f"Respond in a valid JSON format with meaningful categories and values. Ensure all keys and values are well-structured."
        )
        data = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant specializing in medical diagnostics."},
                {"role": "user", "content": prompt},
            ],
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=HEADERS,
            json=data,
        )
        response.raise_for_status()

        # Log the raw response
        raw_response = response.json()
        print("Raw OpenAI Response:", json.dumps(raw_response, indent=4))

        # Extract content and clean JSON
        content = raw_response["choices"][0]["message"]["content"].strip()
        cleaned_content = re.sub(r"^```json|```$", "", content, flags=re.MULTILINE).strip()

        # Save intermediate raw response
        intermediate_output_path = os.path.join(INTERMEDIATE_FOLDER, "raw_openai_response.json")
        with open(intermediate_output_path, 'w') as intermediate_file:
            json.dump(raw_response, intermediate_file, indent=4)
        print(f"Raw OpenAI response saved to: {intermediate_output_path}")

        return cleaned_content
    except requests.exceptions.RequestException as e:
        print(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        print(f"Error while analyzing with OpenAI: {e}")
        return None

def parse_openai_response(response):
    """Parse OpenAI response and handle JSON parsing issues."""
    try:
        if not response:
            raise ValueError("Empty response from OpenAI.")

        # Use regex to extract valid JSON if needed
        json_matches = re.findall(r'\{.*\}', response, re.DOTALL)
        for match in json_matches:
            try:
                return json.loads(match)
            except json.JSONDecodeError:
                continue

        raise ValueError("Unable to parse JSON from OpenAI response.")
    except json.JSONDecodeError as e:
        print(f"JSON decoding error: {e}")
        error_output_path = os.path.join(OUTPUT_FOLDER, "error_openai_response.json")
        with open(error_output_path, 'w') as error_file:
            error_file.write(response)
        print(f"Problematic JSON saved to: {error_output_path}")
        return None
    except Exception as e:
        print(f"Error parsing OpenAI response: {e}")
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
        parsed_data = parse_openai_response(openai_response)
        if not parsed_data:
            raise ValueError("No meaningful data extracted.")

        print("Saving extracted data...")
        save_output(parsed_data, pdf_path)

        # Final output as JSON for integration
        print(json.dumps(parsed_data))  # Ensure the last output is valid JSON
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

