#!/bin/bash

# Install Tesseract OCR
apt-get update && apt-get install -y tesseract-ocr

# Optional: Install poppler-utils (for pdf2image if needed)
apt-get install -y poppler-utils

# Install Node & Python dependencies
npm install
pip install -r requirements.txt
