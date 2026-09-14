# Activate the virtual environment
if (Test-Path ".\venv\Scripts\Activate.ps1") {
    . .\venv\Scripts\Activate.ps1
} else {
    Write-Warning "Virtual environment not found. Please run 'python -m venv venv' first."
}

# Run the AI service
python app.py
