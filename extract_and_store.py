import os
import subprocess
import json
from pymongo import MongoClient
from datetime import datetime

def convert_pdf_to_images(pdf_path, output_folder):
    """Convert a PDF file to individual images using ImageMagick."""
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    try:
        subprocess.run(
            ["magick", "convert", "-density", "300", pdf_path, f"{output_folder}/page-%03d.png"],
            check=True
        )
        print(f"PDF successfully converted to images in {output_folder}")
    except subprocess.CalledProcessError as e:
        print(f"Error converting PDF to images: {e}")
        raise

def extract_text_from_images(image_folder, output_text_file):
    """Extract text from images using Tesseract OCR."""
    try:
        with open(output_text_file, "w") as output_file:
            for image_file in sorted(os.listdir(image_folder)):
                if image_file.endswith(".png"):
                    image_path = os.path.join(image_folder, image_file)
                    text = subprocess.check_output(["tesseract", image_path, "stdout"], encoding="utf-8")
                    output_file.write(text + "\n")
        print(f"Text extracted and saved to {output_text_file}")
    except subprocess.CalledProcessError as e:
        print(f"Error extracting text from images: {e}")
        raise

def load_master_terms(file_path):
    """Load the master terms from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)

def extract_parameters(extracted_text, terms_master):
    """Extract key parameters from the extracted text."""
    extracted_params = {}
    for category, terms in terms_master.items():
        for term in terms:
            term_lower = term.lower()
            for line in extracted_text.splitlines():
                line_lower = line.lower()
                if term_lower in line_lower:
                    value = line.split(term, 1)[-1].strip().strip(':').strip()
                    extracted_params[category] = value
                    break
    return extracted_params

def save_parameters_to_db(extracted_params, report_date, db_uri="mongodb://localhost:27017", db_name="medicalReportsDB"):
    """Save the extracted parameters to MongoDB."""
    try:
        client = MongoClient(db_uri)
        db = client[db_name]
        reports_collection = db["reports"]

        # Insert or update report data
        report = reports_collection.find_one({"report_date": report_date})
        if report:
            report["parameters"].update(extracted_params)
            reports_collection.update_one({"_id": report["_id"]}, {"$set": {"parameters": report["parameters"]}})
        else:
            reports_collection.insert_one({"report_date": report_date, "parameters": extracted_params})

        print(f"Parameters saved to the database with report_date: {report_date}")
    except Exception as e:
        print(f"Error saving to the database: {e}")
        raise

def main():
    """Main function to process a PDF, extract text, extract parameters, and save to DB."""
    # Paths
    pdf_path = "input_reports/cbc 1.pdf"  # Update with your PDF file
    image_output_folder = "temp_images"
    extracted_text_file = f"temp_text/extracted_text_{datetime.now().strftime('%Y%m%d%H%M%S')}.txt"
    master_file_path = "terms_master.json"

    # Convert PDF to images
    convert_pdf_to_images(pdf_path, image_output_folder)

    # Extract text from images
    extract_text_from_images(image_output_folder, extracted_text_file)

    # Load terms master
    terms_master = load_master_terms(master_file_path)

    # Read extracted text
    with open(extracted_text_file, "r") as file:
        extracted_text = file.read()

    # Extract parameters
    extracted_params = extract_parameters(extracted_text, terms_master)

    # Save parameters to the database
    report_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_parameters_to_db(extracted_params, report_date)

if __name__ == "__main__":
    main()

