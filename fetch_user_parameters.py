from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI")
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client["medicalReportsDB"]
collection = db["reports"]

def fetch_user_parameters(user_id):
    """Fetch all parameters and their values for a given user."""
    try:
        # Retrieve the user's document
        user_document = collection.find_one({"userId": user_id})

        if not user_document or "reports" not in user_document:
            print(f"No reports found for user {user_id}.")
            return {}

        # Consolidate parameters and values
        consolidated_parameters = {}
        for report in user_document["reports"]:
            for parameter, values in report.get("parameters", {}).items():
                if parameter not in consolidated_parameters:
                    consolidated_parameters[parameter] = []
                consolidated_parameters[parameter].extend(values)

        # Remove duplicates for each parameter
        for parameter in consolidated_parameters:
            consolidated_parameters[parameter] = list(set(consolidated_parameters[parameter]))

        print(f"Fetched parameters for user {user_id}:\n")
        for parameter, values in consolidated_parameters.items():
            print(f"{parameter}: {values}")

        return consolidated_parameters
    except Exception as e:
        print(f"Error fetching parameters: {e}")
        return {}

if __name__ == "__main__":
    user_id = input("Enter the user ID: ").strip()
    parameters = fetch_user_parameters(user_id)
