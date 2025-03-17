import json
import re
import requests
import os
import sys
from dotenv import load_dotenv

# Load API key from environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HEADERS = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}

# Standardize reference ranges format
def standardize_reference_range(value):
    match = re.search(r'[\[\(](.*?)[\]\)]', value)
    if match:
        return f"({match.group(1)})"
    return value

# Preserve qualitative descriptors
def extract_qualitative_value(value):
    match = re.match(r'([a-zA-Z ]+) \((.*?)\)', value)
    if match:
        return f"{match.group(1)} ({match.group(2)})"
    return value

# Ensure missing data is explicitly marked
def handle_missing_data(value):
    return value.strip() if value and value.strip() else "MISSING DATA"

# Strip backticks and validate JSON
def clean_json_response(response_content):
    try:
        cleaned_content = re.sub(r'^```json|```$', '', response_content, flags=re.MULTILINE).strip()
        return json.loads(cleaned_content)
    except json.JSONDecodeError as e:
        print(f"\n❌ JSON Decode Error: {e}")
        with open("error_log.json", "w") as f:
            f.write(response_content)
        return None

# Function to analyze text using OpenAI
def analyze_with_openai(text):
    payload = {
        "model": "gpt-3.5-turbo-0125",
        "messages": [{"role": "user", "content": text}],
        "temperature": 0.0
    }
    try:
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=HEADERS, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"\n❌ OpenAI API Error: {e}")
        return None

# Function to clean and structure OpenAI output
def process_openai_response(response):
    try:
        if not response:
            return {"error": "No response from OpenAI"}

        raw_content = response["choices"][0]["message"]["content"].strip()

        # Debug: Print raw OpenAI response
        print("\n=== DEBUG: Raw OpenAI Response ===\n", raw_content, "\n================================\n")

        data = clean_json_response(raw_content)
        if not data:
            return {"error": "Invalid JSON response"}

        # Normalize medical parameters
        if "Medical Parameters" in data:
            for category, subcategories in data["Medical Parameters"].items():
                if isinstance(subcategories, dict):
                    for test, details in subcategories.items():
                        if isinstance(details, dict):
                            for key, value in details.items():
                                if isinstance(value, str):
                                    data["Medical Parameters"][category][test][key] = extract_qualitative_value(
                                        standardize_reference_range(handle_missing_data(value))
                                    )
        return data
    except Exception as e:
        print(f"\n❌ Error processing OpenAI response: {e}")
        return {"error": "Failed to process response"}

# Main execution
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("\nUsage: python script.py <input_file> <output_file>\n")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    # Read input file and print for debugging
    try:
        with open(input_file, "r") as f:
            input_text = f.read()
    except FileNotFoundError:
        print(f"\n❌ Error: Input file '{input_file}' not found.\n")
        sys.exit(1)

    print("\n=== DEBUG: Input File Content ===\n", input_text, "\n================================\n")

    # Analyze with OpenAI
    response = analyze_with_openai(input_text)
    structured_data = process_openai_response(response)

    # Save structured output
    with open(output_file, "w") as f:
        json.dump(structured_data, f, indent=4)

    print(f"\n✅ Output saved to: {output_file}")

