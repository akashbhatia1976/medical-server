import pytesseract
from PIL import Image
import os
import subprocess

def convert_pdf_to_images(pdf_path, output_folder):
    """Convert a PDF into individual images for each page using ImageMagick."""
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    command = [
        "magick",  # Use `magick` for ImageMagick v7+
        "convert",  # The sub-command for conversion
        "-density", "300",  # High resolution for better OCR accuracy
        pdf_path,
        os.path.join(output_folder, "page-%03d.png")  # Output image pattern
    ]
    try:
        subprocess.run(command, check=True)
        print(f"PDF successfully converted to images in {output_folder}")
    except subprocess.CalledProcessError as e:
        print(f"Error during PDF conversion: {e}")
        raise

def extract_text_from_images(image_folder):
    """Extract text from all images in a folder using Tesseract OCR."""
    extracted_text = ""
    image_files = sorted(
        [f for f in os.listdir(image_folder) if f.endswith(".png")]
    )

    for image_file in image_files:
        image_path = os.path.join(image_folder, image_file)
        text = pytesseract.image_to_string(Image.open(image_path))
        extracted_text += text + "\n"

    return extracted_text

def save_text_to_file(text, output_folder, output_file_name):
    """Save the extracted text to a file in the specified folder."""
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    output_file_path = os.path.join(output_folder, output_file_name)
    with open(output_file_path, "w") as file:
        file.write(text)
    print(f"Extracted text saved to {output_file_path}")

def main():
    pdf_path = input("Enter the path to the PDF file: ").strip()
    temp_image_folder = "temp_images"
    extracted_folder = "extracted_files"  # Folder for saving extracted text
    output_file_name = "extracted_text.txt"

    # Convert PDF to images
    convert_pdf_to_images(pdf_path, temp_image_folder)

    # Extract text from images
    extracted_text = extract_text_from_images(temp_image_folder)

    # Save the extracted text
    save_text_to_file(extracted_text, extracted_folder, output_file_name)

    # Clean up (optional): Remove the temporary images
    for file in os.listdir(temp_image_folder):
        os.remove(os.path.join(temp_image_folder, file))
    os.rmdir(temp_image_folder)
    print("Temporary images deleted.")

if __name__ == "__main__":
    main()

