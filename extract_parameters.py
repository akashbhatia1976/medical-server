import json
from openai import OpenAI

client = OpenAI(api_key=openai_api_key)
import os

def load_master_terms(file_path):
    """Load the master terms from a JSON file."""
    with open(file_path, 'r') as file:
        return json.load(file)

def extract_parameters(extracted_text, terms_master):
    """Extract key parameters from the extracted text."""
    extracted_params = {}

    for category, terms in terms_master.items():
        for term in terms:
            term_lower = term.lower()
            for line in extracted_text.splitlines():
                line_lower = line.lower()
                if term_lower in line_lower:
                    value = line.split(term, 1)[-1].strip().strip(':').strip()
                    extracted_params[category] = value
                    break

    return extracted_params

def analyze_with_openai(extracted_text, prompt, openai_api_key):
    """Analyze the extracted text using OpenAI's GPT model."""
    try:
        response = client.chat.completions.create(model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": f"{prompt}\n\n{extracted_text}"}
        ])
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error while analyzing with OpenAI: {e}")
        return None

def save_analysis_result(result, output_file_path):
    """Save the analysis result to a file."""
    with open(output_file_path, 'w') as file:
        file.write(result)

def main():
    """Main function to run the parameter extraction and analysis."""
    # Paths
    master_file_path = "terms_master.json"
    extracted_text_file_path = "tests/extracted_text.txt"
    output_file_path = "tests/analysis_result.txt"

    # Prompt for OpenAI API key
    openai_api_key = input("Please enter your OpenAI API key: ").strip()

    # Load terms master
    terms_master = load_master_terms(master_file_path)

    # Read extracted text
    with open(extracted_text_file_path, 'r') as file:
        extracted_text = file.read()

    # Extract parameters
    extracted_params = extract_parameters(extracted_text, terms_master)

    # Prepare prompt for OpenAI
    prompt = "Analyze the health of the user having these parameters:\n" + json.dumps(extracted_params, indent=2)

    # Analyze using OpenAI
    analysis_result = analyze_with_openai(extracted_text, prompt, openai_api_key)

    # Save analysis result
    if analysis_result:
        save_analysis_result(analysis_result, output_file_path)
        print(f"Analysis result saved to {output_file_path}")
    else:
        print("Analysis failed. No result to save.")

if __name__ == "__main__":
    main()

