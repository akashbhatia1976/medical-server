#!/usr/bin/env bash

# 📦 Install system-level dependencies
echo "🔧 Installing Tesseract and required dependencies..."
sudo apt-get update -y
sudo apt-get install -y tesseract-ocr libtesseract-dev poppler-utils

# 🐍 Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# 📦 Install Python dependencies
echo "🐍 Installing Python packages from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

# ✅ Confirm Tesseract installation
echo "✅ Tesseract installed version:"
tesseract --version
