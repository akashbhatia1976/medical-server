import sys
import json
import pandas as pd
import re

def load_csv(file_path):
    """
    Load a CSV file and return it as a Pandas DataFrame.
    """
    try:
        return pd.read_csv(file_path)
    except Exception as e:
        print(f"Error loading file {file_path}: {e}")
        return None

def extract_date_from_filename(file_path):
    """
    Extract a date in YYYYMMDD format from the file name, if present.
    """
    file_name = file_path.split("/")[-1]  # Extract the file name
    match = re.search(r"\d{8}", file_name)  # Match a date in YYYYMMDD format
    return match.group(0) if match else "Unknown Date"

def compare_parameters(df1, df2):
    """
    Compare parameters in two dataframes and return differences.
    """
    differences = []

    # Ensure both files have the same parameter names
    common_parameters = set(df1.columns).intersection(set(df2.columns))

    if not common_parameters:
        return {"error": "No common parameters to compare"}

    for parameter in common_parameters:
        for i in range(max(len(df1), len(df2))):
            file1_value = df1[parameter].iloc[i] if i < len(df1) else "N/A"
            file2_value = df2[parameter].iloc[i] if i < len(df2) else "N/A"

            # Handle NaN or missing values
            if pd.isnull(file1_value):
                file1_value = "N/A"
            if pd.isnull(file2_value):
                file2_value = "N/A"

            if file1_value != file2_value:
                differences.append({
                    "parameter": parameter,
                    "row": i + 1,
                    "file1_value": file1_value,
                    "file2_value": file2_value
                })

    return differences

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Two file paths must be provided"}))
        sys.exit(1)

    file1 = sys.argv[1]
    file2 = sys.argv[2]

    # Extract dates from file names
    file1_date = extract_date_from_filename(file1)
    file2_date = extract_date_from_filename(file2)

    # Load CSV files
    df1 = load_csv(file1)
    df2 = load_csv(file2)

    if df1 is None or df2 is None:
        print(json.dumps({"error": "Failed to load one or both files"}))
        sys.exit(1)

    # Perform the comparison
    differences = compare_parameters(df1, df2)

    if "error" in differences:
        print(json.dumps(differences))
        sys.exit(1)

    # Return the comparison results with dates
    result = {
        "file1_date": file1_date,
        "file2_date": file2_date,
        "comparison": differences
    }
    print(json.dumps(result, indent=4))

if __name__ == "__main__":
    main()

