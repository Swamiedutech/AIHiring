"""
Summary Generator Module
Generates intelligent summaries for resumes, assessments, and interviews
"""
import os
import logging
import json
import re
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from config import Config
from utils import strip_markdown, llm_manager

load_dotenv()
logger = logging.getLogger(__name__)

class SummaryGenerator:
    """Generate comprehensive summaries using AI"""
    
    def __init__(self):
        """Initialize the summary generator with AI"""
        self.model = Config.GENAI_MODEL or "gemini-2.0-flash"
        logger.info(f"SummaryGenerator initialized.")
    
    def generate_resume_summary(self, parsed_resume: Dict[str, Any]) -> Dict[str, Any]:
        """Generate comprehensive resume summary"""
        try:
            skills = self._format_skills(parsed_resume.get('skills', {}))
            education = self._format_education(parsed_resume.get('education', []))
            experience = self._format_experience(parsed_resume.get('experience', []))
            
            prompt = f"""Based on this candidate profile, generate comprehensive summaries:
Skills: {skills}
Education: {education}
Experience: {experience}
Raw Profile: {parsed_resume.get('raw_text', '')[:2000]}

Provide in JSON format:
{{
    "executive_summary": "Professional 2-3 sentence summary",
    "professional_overview": "Detailed paragraph about candidate",
    "key_strengths": ["strength1", ...],
    "career_trajectory": "Description of career progression",
    "technical_proficiency": {{"level": "expert|advanced|intermediate|beginner", "areas": ["area1", ...]}},
    "leadership_qualities": ["quality1", ...] or [],
    "learning_agility": "Description of ability to learn new technologies",
    "recommended_roles": ["role1", ...],
    "growth_potential": "Assessment of future potential"
}}"""
            
            response_text = llm_manager.generate_completion('RESUME_SCORING', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return self._default_summary_response()
        except Exception as e:
            logger.error(f"Error generating resume summary: {e}")
            return self._default_summary_response()

    def generate_assessment_summary(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate technical assessment summary"""
        try:
            prompt = f"""Analyze this technical assessment:
Assessment Data: {json.dumps(assessment_data, indent=2)}

Provide detailed analysis in JSON format:
{{
    "overall_performance": "excellent|good|average|poor",
    "performance_score": 0-100,
    "technical_domains": {{
        "domain_name": {{"score": 0-100, "remarks": "comment"}}
    }},
    "strengths": ["strength1", ...],
    "areas_for_improvement": ["area1", ...],
    "recommendations": ["recommendation1", ...],
    "learning_path": ["topic1", ...],
    "estimated_skill_level": "junior|mid-level|senior",
    "readiness_for_role": {{"ready": true/false, "gap_analysis": "analysis"}},
    "next_steps": ["step1", ...]
}}"""
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return self._default_assessment_response()
        except Exception as e:
            logger.error(f"Error generating assessment summary: {e}")
            return self._default_assessment_response()

    def generate_interview_summary(self, interview_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate interview summary and feedback"""
        try:
            prompt = f"""Analyze this interview session:
Transcript: {interview_data.get('transcript', '')[:2000]}

Provide comprehensive evaluation in JSON format:
{{
    "interview_score": 0-100,
    "performance_rating": "excellent|good|average|poor",
    "communication_skills": {{"score": 0-100, "feedback": "comment"}},
    "technical_knowledge": {{"score": 0-100, "feedback": "comment"}},
    "problem_solving": {{"score": 0-100, "feedback": "comment"}},
    "cultural_fit_indicators": {{"score": 0-100, "feedback": "comment"}},
    "strengths_demonstrated": ["strength1", ...],
    "concerns": ["concern1", ...] or [],
    "follow_up_questions": ["question1", ...],
    "recommendation": "hire|reject|further_rounds_needed",
    "detailed_feedback": "feedback",
    "interview_insights": {{
        "communication_style": "style",
        "energy_level": "high|medium|low",
        "engagement": "engaged",
        "enthusiasm": "high"
    }},
    "next_steps": ["step1", ...]
}}"""
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return self._default_interview_response()
        except Exception as e:
            logger.error(f"Error generating interview summary: {e}")
            return self._default_interview_response()

    def generate_comparison_summary(self, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate comparative analysis of multiple candidates"""
        try:
            prompt = f"Compare these candidates: {json.dumps(candidates, indent=2)}"
            response_text = llm_manager.generate_completion('LOW_COST_SCALING', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            return {'comparison_summary': 'Unable to generate comparison', 'ranked_candidates': []}
        except Exception as e:
            logger.error(f"Error generating comparison summary: {e}")
            return {'comparison_summary': 'Error in comparison', 'ranked_candidates': []}

    def generate_feedback(self, context: str, feedback_type: str) -> str:
        """Generate specific feedback"""
        try:
            prompt = f"Generate {feedback_type} feedback for: {context}"
            return llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
        except Exception as e:
            logger.error(f"Error generating feedback: {e}")
            return "Unable to generate feedback."

    # Helper methods
    def _format_skills(self, skills: Dict[str, List[str]]) -> str:
        return "\n".join([f"{c}: {', '.join(s)}" for c, s in skills.items()])
    
    def _format_education(self, education: List[Dict[str, Any]]) -> str:
        return "\n".join([f"{e.get('degree', 'Unknown')} ({e.get('year_of_passout', '')})" for e in education]) or "Not specified"
    
    def _format_experience(self, experience: List[Dict[str, Any]]) -> str:
        return "\n".join([f"{e.get('position', 'Unknown')} - {e.get('duration_years', 0)} years" for e in experience]) or "None"
    
    def _default_summary_response(self) -> Dict[str, Any]:
        return {'executive_summary': 'Unable to generate', 'professional_overview': '', 'key_strengths': [], 'career_trajectory': '', 'technical_proficiency': {'level': 'unknown', 'areas': []}, 'leadership_qualities': [], 'learning_agility': '', 'recommended_roles': [], 'growth_potential': ''}
    
    def _default_assessment_response(self) -> Dict[str, Any]:
        return {'overall_performance': 'unknown', 'performance_score': 0, 'technical_domains': {}, 'strengths': [], 'areas_for_improvement': [], 'recommendations': [], 'learning_path': [], 'estimated_skill_level': 'unknown'}
    
    def _default_interview_response(self) -> Dict[str, Any]:
        return {'interview_score': 0, 'performance_rating': 'unknown', 'communication_skills': {'score': 0, 'feedback': ''}, 'technical_knowledge': {'score': 0, 'feedback': ''}, 'problem_solving': {'score': 0, 'feedback': ''}, 'cultural_fit_indicators': {'score': 0, 'feedback': ''}, 'strengths_demonstrated': [], 'concerns': [], 'recommendation': 'further_rounds_needed', 'detailed_feedback': ''}
