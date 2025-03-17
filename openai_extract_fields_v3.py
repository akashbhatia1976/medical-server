import os
import json
import requests
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

# Helper function to log messages
def log(message):
    """Log messages to the console."""
    print(message)

# Helper function to parse OpenAI response content
def extract_json_content(content):
    """Extract valid JSON block from OpenAI's response content."""
    try:
        # Try to parse the content directly
        parsed_json = json.loads(content)
        return parsed_json
    except json.JSONDecodeError:
        log("Direct parsing failed, attempting extraction from raw content.")
        # Attempt to locate the JSON portion
        try:
            json_start = content.find("{")
            json_end = content.rfind("}")
            if json_start == -1 or json_end == -1:
                raise ValueError("No valid JSON block found in the response.")
            json_str = content[json_start:json_end + 1]
            return json.loads(json_str)
        except Exception as e:
            log(f"Error extracting JSON content: {e}")
            return None

# Function to analyze text using OpenAI
def analyze_with_openai(text):
    """Send cleaned text to OpenAI and get structured output."""
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

        # Extract JSON content from the response
        return extract_json_content(content)
    except requests.exceptions.RequestException as e:
        log(f"Request error with OpenAI: {e}")
        return None
    except Exception as e:
        log(f"Error analyzing with OpenAI: {e}")
        return None

# Main function
def main():
    if len(sys.argv) < 3:
        print("Usage: python script.py <file_path> <output_file_path>")
        sys.exit(1)

    input_text_path = sys.argv[1]
    output_file_path = sys.argv[2]

    try:
        # Read input text
        with open(input_text_path, "r") as file:
            input_text = file.read()

        log("Analyzing text with OpenAI...")
        openai_response = analyze_with_openai(input_text)
        if not openai_response:
            raise ValueError("Failed to analyze text with OpenAI.")

        # Save the response
        standardized_output = {
            "success": bool(openai_response.get("categories")),
            "categories": openai_response.get("categories", []),
            "message": "Data extraction completed" if openai_response.get("categories") else "No data extracted",
        }

        with open(output_file_path, "w") as output_file:
            json.dump(standardized_output, output_file, indent=4)

        log(f"Output saved to: {output_file_path}")
    except Exception as e:
        error_file_path = output_file_path.replace(".json", "_error.json")
        with open(error_file_path, "w") as error_file:
            json.dump({"error": str(e)}, error_file, indent=4)
        log(f"Error logged to: {error_file_path}")
        sys.exit(1)

if __name__ == "__main__":
    main()
