import json
import os
from pymongo import MongoClient  # Assuming you're using MongoDB

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

def save_to_database(user_id, report_date, parameters, db_uri="mongodb://localhost:27017/", db_name="medicalReportsDB"):
    """Save the extracted parameters to the database."""
    client = MongoClient(db_uri)
    db = client[db_name]
    collection = db["reports"]

    # Check if a report exists for the user and date
    existing_report = collection.find_one({"user_id": user_id, "date": report_date})
    
    if existing_report:
        # Update existing fields or add new ones
        for param, value in parameters.items():
            existing_report["parameters"][param] = value
        collection.update_one({"_id": existing_report["_id"]}, {"$set": {"parameters": existing_report["parameters"]}})
    else:
        # Create a new report
        collection.insert_one({
            "user_id": user_id,
            "date": report_date,
            "parameters": parameters
        })

    client.close()

def main():
    """Main function to process a single extracted text file."""
    # Paths
    master_file_path = "terms_master.json"
    extracted_text_file_path = input("Enter the path to the extracted text file: ").strip()
    db_uri = "mongodb://localhost:27017/"

    # Load terms master
    terms_master = load_master_terms(master_file_path)

    # Read the extracted text file
    if not os.path.exists(extracted_text_file_path):
        print(f"File not found: {extracted_text_file_path}")
        return

    with open(extracted_text_file_path, 'r') as file:
        extracted_text = file.read()

    # Extract parameters
    extracted_params = extract_parameters(extracted_text, terms_master)

    # Input user ID and report date
    user_id = input("Enter the user ID: ").strip()
    report_date = input("Enter the report date (YYYY-MM-DD): ").strip()

    # Save parameters to the database
    save_to_database(user_id, report_date, extracted_params, db_uri)

    print(f"Data from {extracted_text_file_path} has been saved to the database.")

if __name__ == "__main__":
    main()
