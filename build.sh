#!/bin/bash

# Install system dependencies (including Tesseract)
apt-get update && apt-get install -y tesseract-ocr libtesseract-dev libleptonica-dev poppler-utils

# Optional: Confirm it's installed and log the version
echo "✅ Tesseract installed version:"
tesseract --version

# Create Python virtual environment
python3 -m venv venv

# Activate and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Build complete"
