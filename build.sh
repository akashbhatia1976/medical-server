#!/usr/bin/env bash

# ✅ Create virtualenv and activate it
python3 -m venv venv
source venv/bin/activate

echo "🐍 Installing Python packages from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

echo "📦 Installing Node.js packages..."
npm install

