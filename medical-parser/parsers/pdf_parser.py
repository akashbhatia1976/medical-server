import pdfplumber
import csv

def parse_pdf_to_csv(input_path, output_path):
    try:
        with pdfplumber.open(input_path) as pdf:
            all_text = ""
            for page in pdf.pages:
                all_text += page.extract_text()

            # Split the text into lines for processing
            lines = all_text.split("\n")

            # Create CSV rows
            rows = []
            for line in lines:
                rows.append({"content": line.strip()})

            # Write to CSV
            with open(output_path, mode="w", newline="") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=["content"])
                writer.writeheader()
                writer.writerows(rows)

        print(f"Processed {input_path} into {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

