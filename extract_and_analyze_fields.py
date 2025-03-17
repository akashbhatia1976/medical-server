import os
import json
import requests
from pdf2image import convert_from_path
import pytesseract
import tempfile
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF pages using Tesseract OCR."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            images = convert_from_path(pdf_path, output_folder=temp_dir, fmt='png')
            extracted_text = ""
            for image in images:
                extracted_text += pytesseract.image_to_string(image)
        return extracted_text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None

def analyze_fields_with_openai(extracted_text, api_key):
    """Send the extracted text to OpenAI to analyze and extract fields (parameter names)."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prompt = (
        "Extract only the key health parameter names from the following medical report. "
        "Do not include their values:\n\n"
        f"{extracted_text}"
    )
    data = {
        "model": "gpt-4",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"Error analyzing text with OpenAI: {e}")
        return None

def save_openai_output_to_file(output, folder="openAI_output"):
    """Save OpenAI output to a file in the specified folder."""
    if not os.path.exists(folder):
        os.makedirs(folder)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    file_path = os.path.join(folder, f"openai_fields_output_{timestamp}.txt")
    with open(file_path, "w") as text_file:
        text_file.write(output)
    print(f"OpenAI output saved to {file_path}")
    return file_path

def main():
    # Get OpenAI API key from environment variables
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in .env file.")
        return

    # Prompt user for PDF file path
    pdf_path = input("Enter the path to the PDF file: ").strip()

    # Step 1: Extract text from the PDF
    print("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)

    if not extracted_text:
        print("Failed to extract text from PDF.")
        return

    # Step 2: Analyze text with OpenAI for fields
    print("Analyzing text with OpenAI...")
    analysis_result = analyze_fields_with_openai(extracted_text, api_key)

    if not analysis_result:
        print("Failed to analyze text with OpenAI.")
        return

    # Step 3: Save OpenAI output to a file
    save_openai_output_to_file(analysis_result)
    print("Process complete. Review the OpenAI output for parameter fields.")

if __name__ == "__main__":
    main()
