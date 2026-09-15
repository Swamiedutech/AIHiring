"""
Configuration module for AI Service
Handles environment variables and configuration settings
"""
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from the same directory as config.py
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

class Config:
    """Base configuration"""
    
    # Google Generative AI Configuration
    GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
    GEMINI_API_KEYS = os.getenv('GEMINI_API_KEYS', GOOGLE_API_KEY)
    GENAI_MODEL = os.getenv('GENAI_MODEL', 'gemini-2.5-flash')
    
    # Flask Configuration
    FLASK_ENV = os.getenv('FLASK_ENV', 'production')
    DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    HOST = os.getenv('AI_SERVICE_HOST', '127.0.0.1')
    PORT = int(os.getenv('AI_SERVICE_PORT', 5001))
    
    # Security
    AI_SERVICE_SECRET = os.getenv('AI_SERVICE_SECRET', 'ai_hiring_default_secret_key_123')
    
    # Database Configuration
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', 5432))
    DB_NAME = os.getenv('DB_NAME', 'msk_db')
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    # File Upload Configuration
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', '../uploads')
    MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 50 * 1024 * 1024))  # 50MB
    ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc', 'txt'}
    
    # AI Service Configuration
    MAX_TOKENS = int(os.getenv('MAX_TOKENS', 2048))
    TEMPERATURE = float(os.getenv('AI_TEMPERATURE', 0.7))
    
    # Cache Configuration
    CACHE_ENABLED = os.getenv('CACHE_ENABLED', 'true').lower() == 'true'
    CACHE_TTL = int(os.getenv('CACHE_TTL', 3600))  # 1 hour
    
    # NLP Models
    SPACY_MODEL = 'en_core_web_sm'
    TRANSFORMER_MODEL = 'distilbert-base-uncased'
    
    # API Configuration
    API_TIMEOUT = int(os.getenv('API_TIMEOUT', 30))
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'ai_service.log')

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False

class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    DATABASE_URL = 'sqlite:///:memory:'

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config(config_name=None):
    """Get configuration object"""
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')
    return config.get(config_name, DevelopmentConfig)
