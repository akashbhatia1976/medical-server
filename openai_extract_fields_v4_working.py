import os
import json
import re
import requests
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# OpenAI API Key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HEADERS = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

# Mandatory Categories
REQUIRED_CATEGORIES = ["Patient Information", "Medical Parameters", "Doctor's Notes"]

# Log helper
def log(message):
    print(message)

# Function to clean OpenAI response JSON
def extract_json_content(content):
    """Extract valid JSON block from OpenAI's response content."""
    try:
        content = re.sub(r'```json|```', '', content).strip()  # Remove backticks
        return json.loads(content)
    except json.JSONDecodeError as e:
        log(f"Error decoding JSON: {e}")
        return None

# Function to analyze text using OpenAI
def analyze_with_openai(text):
    """Send cleaned text to OpenAI and get structured output."""
    try:
        prompt = (
            "Analyze the following medical report text and extract details into structured JSON. "
            "Ensure the response contains these categories: 'Patient Information', 'Medical Parameters', and 'Doctor's Notes'. "
            "Do NOT omit any category, even if some data is missing. "
            "Standardize 'Name' as 'Patient's Name' and 'Date' as 'Date of Examination'. "
            "If there are no doctor's notes, return an empty list: 'Doctor's Notes': []. "
            "Respond in JSON format ONLY."
        )
        data = {
            "model": "gpt-3.5-turbo-0125",
            "messages": [
                {"role": "system", "content": "You are an AI assistant specializing in medical data extraction."},
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

        return extract_json_content(content)
    except requests.exceptions.RequestException as e:
        log(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        log(f"Error analyzing with OpenAI: {e}")
        return None

# Function to ensure all required categories exist
def validate_and_fix_response(parsed_response):
    """Ensure OpenAI response contains all required categories and normalize fields."""
    if not parsed_response:
        return {
            "success": False,
            "categories": [],
            "parameters": {},
            "message": "No data extracted"
        }
    
    # Add missing categories
    for category in REQUIRED_CATEGORIES:
        if category not in parsed_response:
            parsed_response[category] = {}

    # Convert empty Doctor's Notes object `{}` into a list `[]`
    if isinstance(parsed_response.get("Doctor's Notes"), dict):
        parsed_response["Doctor's Notes"] = []

    # Normalize Patient Information fields
    patient_info = parsed_response.get("Patient Information", {})

    # Ensure "Name" or any variation is converted to "Patient's Name"
    if "Name" in patient_info:
        patient_info["Patient's Name"] = patient_info.pop("Name")
    elif "Patient Name" in patient_info:
        patient_info["Patient's Name"] = patient_info.pop("Patient Name")

    # Ensure "Date" is converted to "Date of Examination"
    if "Date" in patient_info:
        patient_info["Date of Examination"] = patient_info.pop("Date")

    parsed_response["Patient Information"] = patient_info

    return {
        "success": True,
        "categories": list(parsed_response.keys()),
        "parameters": parsed_response,
        "message": "Data extraction completed"
    }

# Main function
def main():
    if len(sys.argv) < 3:
        print("Usage: python script.py <file_path> <output_file_path>")
        sys.exit(1)

    input_text_path = sys.argv[1]
    output_file_path = sys.argv[2]

    try:
        # Read input text
        with open(input_text_path, "r", encoding="utf-8") as file:
            input_text = file.read()

        log("Analyzing text with OpenAI...")
        openai_response = analyze_with_openai(input_text)
        if not openai_response:
            raise ValueError("Failed to analyze text with OpenAI.")

        # Validate and fix missing categories
        standardized_output = validate_and_fix_response(openai_response)

        # Save output JSON
        with open(output_file_path, "w", encoding="utf-8") as output_file:
            json.dump(standardized_output, output_file, indent=4)

        log(f"Output saved to: {output_file_path}")
    except Exception as e:
        error_file_path = output_file_path.replace(".json", "_error.json")
        with open(error_file_path, "w", encoding="utf-8") as error_file:
            json.dump({"error": str(e)}, error_file, indent=4)
        log(f"Error logged to: {error_file_path}")
        sys.exit(1)

if __name__ == "__main__":
    main()

