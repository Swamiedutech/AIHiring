import os
from dotenv import load_dotenv
import google.genai as genai

# Load .env from backend directory
env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(env_path)

api_key = os.environ.get('GOOGLE_API_KEY')
client = genai.Client(api_key=api_key)

print("Available models:")
for model in client.models.list():
    print(f"- {model.name}")
