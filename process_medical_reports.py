import os
import json
import requests
from pdf2image import convert_from_path
import tempfile
from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

def convert_pdf_to_images(pdf_path):
    """Convert PDF pages to images."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            images = convert_from_path(pdf_path, output_folder=temp_dir, fmt='png')
            image_paths = []
            for idx, image in enumerate(images):
                image_path = os.path.join(temp_dir, f"page_{idx + 1}.png")
                image.save(image_path, "PNG")
                image_paths.append(image_path)
        return image_paths
    except Exception as e:
        print(f"Error converting PDF to images: {e}")
        return None

def analyze_image_with_openai(image_path, api_key):
    """Analyze the content of an image using OpenAI."""
    url = "https://api.openai.com/v1/images/analysis"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "text-davinci-003",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant that extracts structured data from medical reports."},
            {"role": "user", "content": f"Please extract all key health parameters from this report image: {image_path}"},
        ],
    }

    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except requests.exceptions.RequestException as e:
        print(f"Error while analyzing image with OpenAI: {e}")
        return None

def save_to_database(parameters, report_date):
    """Save the extracted parameters to the database."""
    try:
        report_data = {
            "report_date": report_date,
            "parameters": parameters
        }
        collection.insert_one(report_data)
        print(f"Parameters saved to the database with report_date: {report_date}")
    except Exception as e:
        print(f"Error saving to database: {e}")

def main():
    # Get the OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set in .env file.")
        return

    # Get PDF path input
    pdf_path = input("Enter the path to the PDF file: ").strip()

    # Convert PDF to images
    print("Converting PDF to images...")
    image_paths = convert_pdf_to_images(pdf_path)
    if not image_paths:
        print("Failed to convert PDF to images.")
        return

    # Analyze each image and combine results
    print("Analyzing images with OpenAI...")
    combined_results = {}
    for image_path in image_paths:
        analysis_result = analyze_image_with_openai(image_path, api_key)
        if analysis_result:
            combined_results[image_path] = analysis_result

    if not combined_results:
        print("No results extracted from the images.")
        return

    # Save results to the database
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_to_database(combined_results, report_date)
    print("Process complete.")

if __name__ == "__main__":
    main()

