import os
import sys
from parsers.pdf_parser import parse_pdf_to_csv

def validate_file(input_file_path):
    """
    Validate the input file path and check if it's a valid PDF.
    """
    if not os.path.exists(input_file_path):
        raise FileNotFoundError(f"Error: File '{input_file_path}' does not exist.")
    if not input_file_path.endswith(".pdf"):
        raise ValueError("Error: Provided file is not a valid PDF.")

def ensure_output_directory(output_dir):
    """
    Ensure the output directory exists; create it if it doesn't.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

def process_file(input_file_path, output_dir):
    """
    Process the given file and save the output as a CSV.
    """
    output_file_path = os.path.join(
        output_dir,
        f"{os.path.splitext(os.path.basename(input_file_path))[0]}.csv"
    )
    parse_pdf_to_csv(input_file_path, output_file_path)
    return output_file_path

def main():
    """
    Main function to handle PDF processing.
    """
    if len(sys.argv) < 2:
        print("Error: No file path provided.")
        sys.exit(1)

    input_file_path = sys.argv[1]
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, "..", "processed")

    try:
        # Validate the input file
        validate_file(input_file_path)

        # Ensure output directory exists
        ensure_output_directory(output_dir)

        # Process the file
        output_file_path = process_file(input_file_path, output_dir)
        print(f"Processed file saved to: {output_file_path}")

    except FileNotFoundError as fnf_error:
        print(fnf_error)
        sys.exit(1)
    except ValueError as val_error:
        print(val_error)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

