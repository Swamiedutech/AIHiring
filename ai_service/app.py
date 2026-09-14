"""
Flask API Server for AI Service
REST API endpoints for all AI operations
"""
import logging
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from config import Config
from ai_service import get_ai_service
from utils import setup_logging, is_valid_file, get_file_ext

# Setup logging
setup_logging(
    log_level=getattr(logging, Config.LOG_LEVEL, logging.INFO)
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_FILE_SIZE

# Get AI service
ai_service = get_ai_service()

# ===================== MIDDLEWARE =====================
@app.before_request
def require_auth_token():
    # Skip health and capabilities endpoint, and CORS preflight
    if request.path in ['/health', '/capabilities'] or request.method == 'OPTIONS':
        return
        
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized - Missing or invalid token'}), 401
        
    token = auth_header.split(' ')[1]
    if token != Config.AI_SERVICE_SECRET:
        return jsonify({'success': False, 'error': 'Unauthorized - Invalid secret token'}), 401

# ===================== UTILITY ENDPOINTS =====================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        status = ai_service.health_check()
        return jsonify(status), 200
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/capabilities', methods=['GET'])
def get_capabilities():
    """Get service capabilities"""
    try:
        capabilities = ai_service.get_capabilities()
        return jsonify({
            'success': True,
            'capabilities': capabilities
        }), 200
    except Exception as e:
        logger.error(f"Error getting capabilities: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== RESUME ENDPOINTS =====================

@app.route('/api/ai/resume/parse', methods=['POST'])
def parse_resume():
    """Parse resume from file upload"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Extract optional job context for role-specific scoring
        job_title = request.form.get('job_title', None)
        job_description = request.form.get('job_description', None)
        job_skills_raw = request.form.get('job_skills', None)
        job_skills = None
        if job_skills_raw:
            try:
                import json as _json
                job_skills = _json.loads(job_skills_raw) if job_skills_raw.startswith('[') else [s.strip() for s in job_skills_raw.split(',')]
            except Exception:
                job_skills = [s.strip() for s in job_skills_raw.split(',')]
        
        # Save file temporarily
        filename = secure_filename(file.filename)
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        # Parse resume with job context
        try:
            result = ai_service.parse_resume(file_path, job_title=job_title, job_description=job_description, job_skills=job_skills)
        finally:
            # Clean up securely even if parsing fails
            if os.path.exists(file_path):
                os.remove(file_path)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error parsing resume: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ai/resume/score', methods=['POST'])
def score_resume():
    """Score resume against job requirements"""
    try:
        data = request.get_json()
        
        if not data or 'parsed_resume' not in data or 'job_requirements' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.score_resume(
            data['parsed_resume'],
            data['job_requirements']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error scoring resume: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/resume/summary', methods=['POST'])
def generate_resume_summary():
    """Generate resume summary"""
    try:
        data = request.get_json()
        
        if not data or 'parsed_resume' not in data:
            return jsonify({'success': False, 'error': 'Missing parsed_resume'}), 400
        
        result = ai_service.generate_resume_summary(data['parsed_resume'])
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating resume summary: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== ASSESSMENT ENDPOINTS =====================

@app.route('/api/ai/assessment/coding', methods=['POST'])
def analyze_coding():
    """Analyze coding solution"""
    try:
        data = request.get_json()
        
        if not data or 'code' not in data or 'problem' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.analyze_coding_challenge(
            data['code'],
            data['problem']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing code: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/assessment/mcq', methods=['POST'])
def analyze_mcq():
    """Analyze MCQ test responses"""
    try:
        data = request.get_json()
        
        if not data or 'questions' not in data or 'answers' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.analyze_mcq_test(
            data['questions'],
            data['answers']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing MCQ: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/assessment/design', methods=['POST'])
def analyze_design():
    """Analyze system design"""
    try:
        data = request.get_json()
        
        if not data or 'design' not in data or 'requirements' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.analyze_system_design(
            data['design'],
            data['requirements']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing design: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/assessment/case-study', methods=['POST'])
def analyze_case():
    """Analyze case study response"""
    try:
        data = request.get_json()
        
        if not data or 'case' not in data or 'solution' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.analyze_case_study(
            data['case'],
            data['solution']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing case study: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/assessment/report', methods=['POST'])
def generate_report():
    """Generate assessment report"""
    try:
        data = request.get_json()
        
        if not data or 'results' not in data:
            return jsonify({'success': False, 'error': 'Missing assessment results'}), 400
        
        result = ai_service.generate_assessment_report(data['results'])
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/assessment/analyze', methods=['POST'])
def analyze_assessment():
    """Generic assessment analysis"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
            
        result = ai_service.analyze_assessment(data)
        
        return jsonify({
            'success': True,
            'score': result.get('overall_score', result.get('score', 70)),
            'insights': result.get('analysis', result.get('insights', 'Assessment analysis completed'))
        }), 200
    except Exception as e:
        logger.error(f"Error in assessment analyze: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== INTERVIEW ENDPOINTS =====================

@app.route('/api/ai/interview/analyze', methods=['POST'])
def analyze_interview():
    """Analyze interview session"""
    try:
        data = request.get_json()
        
        if not data or 'transcript' not in data:
            return jsonify({'success': False, 'error': 'Missing transcript'}), 400
        
        result = ai_service.analyze_interview(
            data['transcript'],
            data.get('details', {})
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing interview: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/interview/answer', methods=['POST'])
def analyze_answer():
    """Analyze individual interview answer"""
    try:
        data = request.get_json()
        
        if not data or 'question' not in data or 'answer' not in data:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
        result = ai_service.analyze_interview_answer(
            data['question'],
            data['answer']
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing answer: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/interview/performance-prediction', methods=['POST'])
def predict_performance():
    """Predict on-job performance"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Missing interview data'}), 400
        
        result = ai_service.predict_interview_performance(data)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error predicting performance: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/interview/speaking-patterns', methods=['POST'])
def analyze_patterns():
    """Analyze speaking patterns"""
    try:
        data = request.get_json()
        
        if not data or 'transcript' not in data:
            return jsonify({'success': False, 'error': 'Missing transcript'}), 400
        
        result = ai_service.analyze_speaking_patterns(data['transcript'])
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing patterns: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== SUMMARY ENDPOINTS =====================

@app.route('/api/ai/summary/assessment', methods=['POST'])
def assessment_summary():
    """Generate assessment summary"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Missing assessment data'}), 400
        
        result = ai_service.generate_assessment_summary(data)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating assessment summary: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/summary/interview', methods=['POST'])
def interview_summary():
    """Generate interview summary"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'Missing interview data'}), 400
        
        result = ai_service.generate_interview_summary(data)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating interview summary: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/candidates/compare', methods=['POST'])
def compare_candidates():
    """Compare multiple candidates"""
    try:
        data = request.get_json()
        
        if not data or 'candidates' not in data:
            return jsonify({'success': False, 'error': 'Missing candidates'}), 400
        
        result = ai_service.compare_candidates(data['candidates'])
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error comparing candidates: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/ai/feedback/generate', methods=['POST'])
def generate_feedback():
    """Generate feedback"""
    try:
        data = request.get_json()
        
        if not data or 'context' not in data:
            return jsonify({'success': False, 'error': 'Missing context'}), 400
        
        feedback_type = data.get('type', 'general')
        result = ai_service.generate_feedback(data['context'], feedback_type)
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating feedback: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ===================== ERROR HANDLERS =====================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors"""
    logger.error(f"Server error: {error}")
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info(f"Starting AI Service on {Config.HOST}:{Config.PORT}")
    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG
    )
