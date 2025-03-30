#!/usr/bin/env bash

# 📦 Install Python packages to user-specific base path
export PYTHONUSERBASE=/opt/render/.python-packages
export PATH=$PYTHONUSERBASE/bin:$PATH

echo "🐍 Installing Python dependencies from requirements.txt..."
pip install --upgrade pip
pip install --user -r requirements.txt

echo "📦 Installing Node.js packages..."
npm install

