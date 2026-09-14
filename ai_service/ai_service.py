"""
AI Service Orchestrator
Central hub for all AI operations - resume parsing, summaries, interviews, assessments
"""
import logging
from typing import Dict, List, Any, Optional
from modules.resume_parser import ResumeParser
from modules.summary_generator import SummaryGenerator
from modules.interview_analyzer import InterviewAnalyzer
from modules.assessment_analyzer import AssessmentAnalyzer
from utils import setup_logging

logger = logging.getLogger(__name__)

class AIService:
    """Main AI Service orchestrator"""
    
    def __init__(self):
        """Initialize all AI modules"""
        setup_logging()
        
        self.resume_parser = ResumeParser()
        self.summary_generator = SummaryGenerator()
        self.interview_analyzer = InterviewAnalyzer()
        self.assessment_analyzer = AssessmentAnalyzer()
        
        logger.info("AI Service initialized successfully")
    
    # ===================== RESUME OPERATIONS =====================
    
    def parse_resume(self, file_path: str, job_title: str = None, job_description: str = None, job_skills: list = None) -> Dict[str, Any]:
        """
        Parse resume from file with optional job context for role-specific scoring
        
        Args:
            file_path: Path to resume file
            job_title: Job title to score against (e.g. "Management Trainee - Marketing")
            job_description: Full job description text
            job_skills: List of required skills for the role
            
        Returns:
            Parsed resume data with role-specific insights
        """
        try:
            logger.info(f"Parsing resume: {file_path}" + (f" for role: {job_title}" if job_title else ""))
            return self.resume_parser.parse_resume(file_path, job_title=job_title, job_description=job_description, job_skills=job_skills)
        except Exception as e:
            logger.error(f"Error parsing resume: {e}")
            raise

    
    def score_resume(self, parsed_resume: Dict[str, Any], job_requirements: str) -> Dict[str, Any]:
        """
        Score resume against job requirements
        
        Args:
            parsed_resume: Parsed resume data
            job_requirements: Job requirements text
            
        Returns:
            Resume scoring results
        """
        try:
            logger.info("Scoring resume against job requirements")
            return self.resume_parser.score_resume(parsed_resume, job_requirements)
        except Exception as e:
            logger.error(f"Error scoring resume: {e}")
            raise
    
    def generate_resume_summary(self, parsed_resume: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate resume summary
        
        Args:
            parsed_resume: Parsed resume data
            
        Returns:
            Resume summary
        """
        try:
            logger.info("Generating resume summary")
            return self.summary_generator.generate_resume_summary(parsed_resume)
        except Exception as e:
            logger.error(f"Error generating resume summary: {e}")
            raise
    
    # ===================== ASSESSMENT OPERATIONS =====================
    
    def analyze_coding_challenge(self, code: str, problem_description: str) -> Dict[str, Any]:
        """
        Analyze coding solution
        
        Args:
            code: Source code
            problem_description: Problem statement
            
        Returns:
            Code analysis results
        """
        try:
            logger.info("Analyzing coding solution")
            return self.assessment_analyzer.analyze_coding_solution(code, problem_description)
        except Exception as e:
            logger.error(f"Error analyzing code: {e}")
            raise
    
    def analyze_mcq_test(self, questions: List[Dict[str, Any]], answers: List[str]) -> Dict[str, Any]:
        """
        Analyze MCQ test responses
        
        Args:
            questions: List of questions
            answers: List of selected answers
            
        Returns:
            MCQ analysis results
        """
        try:
            logger.info("Analyzing MCQ test")
            return self.assessment_analyzer.analyze_mcq_test(questions, answers)
        except Exception as e:
            logger.error(f"Error analyzing MCQ: {e}")
            raise
    
    def analyze_system_design(self, design_description: str, requirements: str) -> Dict[str, Any]:
        """
        Analyze system design
        
        Args:
            design_description: Design explanation
            requirements: System requirements
            
        Returns:
            Design analysis results
        """
        try:
            logger.info("Analyzing system design")
            return self.assessment_analyzer.analyze_system_design(design_description, requirements)
        except Exception as e:
            logger.error(f"Error analyzing design: {e}")
            raise
    
    def analyze_case_study(self, case_description: str, solution: str) -> Dict[str, Any]:
        """
        Analyze case study response
        
        Args:
            case_description: Case study details
            solution: Candidate's solution
            
        Returns:
            Case study analysis results
        """
        try:
            logger.info("Analyzing case study")
            return self.assessment_analyzer.analyze_case_study(case_description, solution)
        except Exception as e:
            logger.error(f"Error analyzing case study: {e}")
            raise
    
    def analyze_assessment(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generic assessment analysis (hybrid)
        
        Args:
            assessment_data: Dictionary containing assessment details
            
        Returns:
            Analysis results
        """
        try:
            category = assessment_data.get('category', '').lower()
            question = assessment_data.get('question', '')
            answer = assessment_data.get('answer', '')
            
            logger.info(f"Analyzing {category} assessment")
            
            if 'coding' in category:
                return self.assessment_analyzer.analyze_coding_solution(answer, question)
            elif 'design' in category:
                return self.assessment_analyzer.analyze_system_design(answer, question)
            elif 'mcq' in category:
                # Default MCQ analysis
                return {'score': 70, 'insights': 'MCQ analysis completed'}
            
            # General fallback to a customized prompt if needed
            return self.assessment_analyzer.analyze_coding_solution(answer, question)
            
        except Exception as e:
            logger.error(f"Error in generic assessment analysis: {e}")
            raise
    
    def generate_assessment_report(self, assessment_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate comprehensive assessment report
        
        Args:
            assessment_results: All assessment results
            
        Returns:
            Comprehensive report
        """
        try:
            logger.info("Generating assessment report")
            return self.assessment_analyzer.generate_assessment_report(assessment_results)
        except Exception as e:
            logger.error(f"Error generating report: {e}")
            raise
    
    # ===================== INTERVIEW OPERATIONS =====================
    
    def analyze_interview(self, transcript: str, interview_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze interview session
        
        Args:
            transcript: Interview transcript
            interview_details: Interview metadata
            
        Returns:
            Interview analysis results
        """
        try:
            logger.info("Analyzing interview")
            return self.interview_analyzer.analyze_interview(transcript, interview_details)
        except Exception as e:
            logger.error(f"Error analyzing interview: {e}")
            raise
    
    def analyze_interview_answer(self, question: str, answer: str) -> Dict[str, Any]:
        """
        Analyze individual interview answer
        
        Args:
            question: Interview question
            answer: Candidate's answer
            
        Returns:
            Answer quality assessment
        """
        try:
            logger.info("Analyzing interview answer")
            return self.interview_analyzer.analyze_answer_quality(question, answer)
        except Exception as e:
            logger.error(f"Error analyzing answer: {e}")
            raise
    
    def predict_interview_performance(self, interview_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict on-job performance based on interview
        
        Args:
            interview_data: Interview analysis data
            
        Returns:
            Performance prediction
        """
        try:
            logger.info("Predicting interview performance")
            return self.interview_analyzer.predict_performance(interview_data)
        except Exception as e:
            logger.error(f"Error predicting performance: {e}")
            raise
    
    def analyze_speaking_patterns(self, transcript: str) -> Dict[str, Any]:
        """
        Analyze speaking patterns from interview
        
        Args:
            transcript: Interview transcript
            
        Returns:
            Speaking patterns analysis
        """
        try:
            logger.info("Analyzing speaking patterns")
            return self.interview_analyzer.extract_speaking_patterns(transcript)
        except Exception as e:
            logger.error(f"Error analyzing patterns: {e}")
            raise
    
    # ===================== SUMMARY OPERATIONS =====================
    
    def generate_assessment_summary(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate technical assessment summary
        
        Args:
            assessment_data: Assessment results
            
        Returns:
            Assessment summary
        """
        try:
            logger.info("Generating assessment summary")
            return self.summary_generator.generate_assessment_summary(assessment_data)
        except Exception as e:
            logger.error(f"Error generating assessment summary: {e}")
            raise
    
    def generate_interview_summary(self, interview_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate interview summary
        
        Args:
            interview_data: Interview analysis data
            
        Returns:
            Interview summary
        """
        try:
            logger.info("Generating interview summary")
            return self.summary_generator.generate_interview_summary(interview_data)
        except Exception as e:
            logger.error(f"Error generating interview summary: {e}")
            raise
    
    def compare_candidates(self, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare multiple candidates
        
        Args:
            candidates: List of candidate data
            
        Returns:
            Comparative analysis
        """
        try:
            logger.info(f"Comparing {len(candidates)} candidates")
            return self.summary_generator.generate_comparison_summary(candidates)
        except Exception as e:
            logger.error(f"Error comparing candidates: {e}")
            raise
    
    def generate_feedback(self, context: str, feedback_type: str) -> str:
        """
        Generate specific feedback
        
        Args:
            context: Context for feedback
            feedback_type: Type of feedback (assessment|interview|resume|general)
            
        Returns:
            Generated feedback
        """
        try:
            logger.info(f"Generating {feedback_type} feedback")
            return self.summary_generator.generate_feedback(context, feedback_type)
        except Exception as e:
            logger.error(f"Error generating feedback: {e}")
            raise
    
    # ===================== HEALTH & METADATA =====================
    
    def health_check(self) -> Dict[str, Any]:
        """Get service health status"""
        return {
            'status': 'healthy',
            'service': 'AI Service',
            'modules': {
                'resume_parser': 'active',
                'summary_generator': 'active',
                'interview_analyzer': 'active',
                'assessment_analyzer': 'active'
            }
        }
    
    def get_capabilities(self) -> Dict[str, List[str]]:
        """Get available capabilities"""
        return {
            'resume': [
                'parse_resume',
                'score_resume',
                'generate_resume_summary',
                'extract_skills',
                'extract_education'
            ],
            'assessment': [
                'analyze_coding_challenge',
                'analyze_mcq_test',
                'analyze_system_design',
                'analyze_case_study',
                'generate_assessment_report'
            ],
            'interview': [
                'analyze_interview',
                'analyze_interview_answer',
                'predict_interview_performance',
                'analyze_speaking_patterns'
            ],
            'summary': [
                'generate_resume_summary',
                'generate_assessment_summary',
                'generate_interview_summary',
                'compare_candidates',
                'generate_feedback'
            ]
        }


# Singleton instance
_ai_service: Optional[AIService] = None

def get_ai_service() -> AIService:
    """Get or create AI Service instance"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
