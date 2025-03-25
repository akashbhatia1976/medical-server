# Use official Node.js base image with Debian
FROM node:18-bullseye

# Install Tesseract and required system libraries
RUN apt-get update && \
    apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    poppler-utils \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend code
COPY . .

# Create virtual environment and install Python dependencies
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --upgrade pip && \
    /app/venv/bin/pip install -r requirements.txt

# Install Node.js dependencies
RUN npm install

# Expose server port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
