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

# Paths for folders and synonyms.json
OUTPUT_FOLDER = "openAi_output"
RAW_TEXT_FOLDER = "raw_text_output"
INTERMEDIATE_FOLDER = "intermediate_outputs"
SYNONYMS_PATH = os.path.join("data", "synonyms.json")
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(RAW_TEXT_FOLDER, exist_ok=True)
os.makedirs(INTERMEDIATE_FOLDER, exist_ok=True)

CHUNK_SIZE = 3500  # Adjusted size for OpenAI token limits

def load_synonyms():
    """Load synonyms from synonyms.json."""
    try:
        with open(SYNONYMS_PATH, "r") as file:
            synonyms = json.load(file)
        print(f"Loaded synonyms from {SYNONYMS_PATH}")
        return synonyms
    except Exception as e:
        print(f"Error loading synonyms.json: {e}")
        sys.exit(1)

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

def sanitize_response_content(content):
    """Sanitize the OpenAI response content to remove unwanted characters."""
    try:
        content = re.sub(r"^```json|```$", "", content, flags=re.MULTILINE).strip()
        content = re.sub(r"```", "", content)  # Remove stray backticks
        return content
    except Exception as e:
        print(f"Error sanitizing content: {e}")
        return content

def save_to_file(data, file_name):
    """Save data to a file."""
    try:
        file_path = os.path.join(INTERMEDIATE_FOLDER, file_name)
        with open(file_path, 'w') as file:
            file.write(data)
        print(f"Saved to {file_path}")
    except Exception as e:
        print(f"Error saving to {file_name}: {e}")

def process_chunk_structure(parsed_chunk, synonyms):
    """Process varying chunk structures into a unified format."""
    try:
        # Handle "medical_reports" structure
        if "medical_reports" in parsed_chunk:
            return convert_medical_reports_to_categories(parsed_chunk, synonyms)
        
        # Handle "MedicalReports" structure
        elif "MedicalReports" in parsed_chunk:
            return convert_medical_reports_to_categories(parsed_chunk, synonyms, key="MedicalReports")
        
        # Handle "reports" structure
        elif "reports" in parsed_chunk:
            return convert_reports_to_categories(parsed_chunk, synonyms)
        
        # Default handler for unknown structures
        else:
            print(f"Unknown structure in parsed chunk: {parsed_chunk.keys()}")
            return {"categories": []}
    
    except Exception as e:
        print(f"Error processing chunk structure: {e}")
        return {"categories": []}

def convert_medical_reports_to_categories(parsed_chunk, synonyms, key="medical_reports"):
    """Convert 'medical_reports' or similar structure to 'categories' format."""
    try:
        categories = []
        for report in parsed_chunk.get(key, []):
            for test_name, test_data in report.get("tests", {}).items():
                category = {"category": test_name, "parameters": []}
                for param in test_data.get("parameters", []):
                    if param["parameter"] in synonyms.get(test_name, []):
                        category["parameters"].append({
                            "name": param["parameter"],
                            "value": param["result"],
                            "unit": param["unit"],
                            "reference_range": param["reference_range"],
                        })
                if category["parameters"]:
                    categories.append(category)
        return {"categories": categories}
    except Exception as e:
        print(f"Error converting medical reports: {e}")
        return {"categories": []}

def convert_reports_to_categories(parsed_chunk, synonyms):
    """Convert 'reports' structure to 'categories' format."""
    try:
        categories = []
        for report in parsed_chunk.get("reports", []):
            category = {"category": report.get("category", "Unknown"), "parameters": []}
            for param in report.get("parameters", []):
                if param["name"] in synonyms.get(category["category"], []):
                    category["parameters"].append({
                        "name": param["name"],
                        "value": param["result"],
                        "unit": param["unit"],
                        "reference_range": param["reference_range"],
                    })
            if category["parameters"]:
                categories.append(category)
        return {"categories": categories}
    except Exception as e:
        print(f"Error converting reports: {e}")
        return {"categories": []}


def convert_lab_results_to_categories(parsed_chunk, synonyms):
    """Convert 'lab_results' structure to 'categories' format."""
    try:
        categories = []
        for category_name, parameters in parsed_chunk.get("lab_results", {}).items():
            category = {"category": category_name, "parameters": []}
            for param_name, param_data in parameters.items():
                if param_name in synonyms.get(category_name, []):
                    category["parameters"].append({
                        "name": param_name,
                        "value": param_data.get("value"),
                        "unit": param_data.get("unit"),
                        "reference_range": param_data.get("reference_range"),
                    })
            if category["parameters"]:
                categories.append(category)
        return {"categories": categories}
    except Exception as e:
        print(f"Error converting 'lab_results' to 'categories': {e}")
        return {"categories": []}

def convert_medical_report_to_categories(parsed_chunk, synonyms):
    """Convert 'MedicalReport' structure to 'categories' format."""
    try:
        test_results = parsed_chunk.get("MedicalReport", {}).get("TestResults", {})
        categories = []
        for test_name, test_data in test_results.items():
            category = {"category": test_name, "parameters": []}
            if test_name in synonyms:
                category["parameters"].append({
                    "name": test_name,
                    "value": test_data.get("Result"),
                    "unit": test_data.get("Unit"),
                    "reference_range": test_data.get("ReferenceRange"),
                })
            if category["parameters"]:
                categories.append(category)
        return {"categories": categories}
    except Exception as e:
        print(f"Error converting 'MedicalReport' to 'categories': {e}")
        return {"categories": []}

def analyze_chunk_with_context(chunk, prev_chunk=None, next_chunk=None, chunk_index=0):
    """Analyze a single chunk of text with OpenAI, including context from previous and next chunks."""
    try:
        save_to_file(chunk, f"chunk_{chunk_index}.txt")

        prompt = (
            "Analyze the following medical report text chunk and extract all categories and parameters "
            "with their values, units, and reference ranges. Respond **strictly** in JSON format:\n\n"
        )
        if prev_chunk:
            prompt += f"Previous Chunk:\n{prev_chunk}\n\n"
        prompt += f"Current Chunk:\n{chunk}\n\n"
        if next_chunk:
            prompt += f"Next Chunk:\n{next_chunk}\n"

        data = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "You are an expert in medical report analysis."},
                {"role": "user", "content": prompt},
            ],
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=HEADERS,
            json=data,
        )
        response.raise_for_status()
        raw_response = response.json()
        content = raw_response["choices"][0]["message"]["content"].strip()

        save_to_file(content, f"chunk_{chunk_index}_openai_response.txt")

        sanitized_content = sanitize_response_content(content)
        json_start = sanitized_content.find("{")
        json_end = sanitized_content.rfind("}")
        if json_start == -1 or json_end == -1:
            raise ValueError("No JSON object found in OpenAI's response.")
        json_content = sanitized_content[json_start:json_end + 1]

        parsed_json = json.loads(json_content)
        return parsed_json

    except json.JSONDecodeError as e:
        print(f"JSON parsing error in chunk {chunk_index}: {e}")
        save_to_file(chunk, f"problematic_chunk_{chunk_index}.txt")
        return None
    except Exception as e:
        print(f"Error analyzing chunk {chunk_index}: {e}")
        return None

def analyze_with_openai_chunked(text, synonyms):
    """Analyze text in chunks and combine results."""
    try:
        chunks = [text[i:i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
        combined_response = {"categories": []}

        for idx, chunk in enumerate(chunks):
            print(f"Processing chunk {idx + 1}/{len(chunks)}")

            prev_chunk = chunks[idx - 1] if idx > 0 else None
            next_chunk = chunks[idx + 1] if idx < len(chunks) - 1 else None

            parsed_chunk = analyze_chunk_with_context(chunk, prev_chunk, next_chunk, idx + 1)
            if parsed_chunk:
                print(f"Parsed chunk structure: {parsed_chunk}")
                filtered_chunk = process_chunk_structure(parsed_chunk, synonyms)
                if filtered_chunk:
                    combined_response["categories"].extend(filtered_chunk.get("categories", []))

        return combined_response
    except Exception as e:
        print(f"Critical error during chunked analysis: {e}")
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
        synonyms = load_synonyms()

        print("Extracting text from PDF...")
        extracted_text = extract_text_from_pdf(pdf_path)
        if not extracted_text:
            raise ValueError("Failed to extract text from PDF.")

        print("Preprocessing text...")
        cleaned_text = preprocess_text(extracted_text)

        print("Analyzing text with OpenAI in chunks...")
        openai_response = analyze_with_openai_chunked(cleaned_text, synonyms)
        if not openai_response:
            raise ValueError("Failed to analyze text with OpenAI.")

        print("Saving extracted data...")
        save_output(openai_response, pdf_path)

        print(json.dumps(openai_response, indent=4))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

