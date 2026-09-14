import os
import sys
from dotenv import load_dotenv
import google.genai as genai
from google.genai import types

# Load .env from backend directory
env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(env_path)

api_key = os.environ.get('GOOGLE_API_KEY')
if not api_key:
    print("Error: GOOGLE_API_KEY environment variable not found.")
    sys.exit(1)

model_name = os.environ.get('GENAI_MODEL', 'gemini-2.0-flash')
client = genai.Client(api_key=api_key)

try:
    print(f"Initializing {model_name} model...")
    
    print("Making test request...")
    response = client.models.generate_content(
        model=model_name,
        contents="Say hello world."
    )
    
    print("\nSUCCESS! Google Gemini API (google-genai) is working perfectly.")
    print("Model replied:")
    print("----------------------------------------")
    print(response.text)
    print("----------------------------------------")
except Exception as e:
    print("\nFAILURE! Could not connect to Gemini API.")
    print(f"Error details: {str(e)}")
    sys.exit(1)
