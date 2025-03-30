#!/usr/bin/env bash

# 🐍 Install Python dependencies globally (no venv on Render)
echo "🐍 Installing Python packages from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

# 📦 Then install Node dependencies
echo "📦 Installing Node.js packages..."
npm install

