import os
import json
from pymongo import MongoClient
from datetime import datetime

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

def insert_reports_from_json(json_files, user_id):
    """Insert multiple reports from JSON files into the database."""
    try:
        # Fetch or create user document
        user_document = collection.find_one({"userId": user_id})
        if not user_document:
            user_document = {"userId": user_id, "reports": []}

        for json_file in json_files:
            # Load report data from JSON
            with open(json_file, 'r') as file:
                report_data = json.load(file)

            # Extract date from the file name (custom logic)
            base_name = os.path.basename(json_file)
            date = base_name.split("_")[0]  # Example: "2024-05-07"

            # Check if a report for this date exists
            report = next((r for r in user_document["reports"] if r["date"] == date), None)
            if not report:
                report = {"date": date, "parameters": {}}
                user_document["reports"].append(report)

            # Insert or update parameters
            for category, values in report_data.items():
                for parameter in values:
                    name, _, value = parameter.partition(":")
                    name = name.strip()
                    value = value.strip()

                    if name not in report["parameters"]:
                        report["parameters"][name] = []
                    report["parameters"][name].append(value)
                    report["parameters"][name] = list(set(report["parameters"][name]))  # Remove duplicates

        # Update or insert the user document
        collection.update_one(
            {"userId": user_id},
            {"$set": user_document},
            upsert=True
        )
        print(f"Reports inserted successfully for user {user_id}.")
    except Exception as e:
        print(f"Error inserting reports: {e}")

if __name__ == "__main__":
    # Directory containing JSON files
    json_dir = input("Enter the directory path containing JSON files: ").strip()
    user_id = input("Enter the user ID: ").strip()

    # List all JSON files in the directory
    json_files = [os.path.join(json_dir, f) for f in os.listdir(json_dir) if f.endswith(".json")]

    # Insert reports into the database
    insert_reports_from_json(json_files, user_id)
