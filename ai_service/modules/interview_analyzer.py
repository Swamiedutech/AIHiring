"""
Interview Analyzer Module
Analyzes interview transcripts and generates behavioral insights
"""
import os
import logging
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from google.genai import types
from dotenv import load_dotenv
from config import Config
from utils import strip_markdown, llm_manager

load_dotenv()
logger = logging.getLogger(__name__)

class InterviewAnalyzer:
    """Analyze interview transcripts and candidate behavior"""
    
    def __init__(self):
        """Initialize the interview analyzer"""
        logger.info("InterviewAnalyzer initialized.")
    
    def analyze_interview_session(self, transcript: str, job_description: str) -> Dict[str, Any]:
        """Analyze a complete interview session"""
        try:
            prompt = f"""Analyze this interview session:
Job Description: {job_description}
Transcript:
{transcript[:3000]}

Provide comprehensive analysis in JSON format:
{{
    "overall_score": 0-100,
    "communication_score": 0-100,
    "technical_score": 0-100,
    "cultural_fit_score": 0-100,
    "strengths": ["strength1", ...],
    "weaknesses": ["weakness1", ...],
    "sentiment_analysis": "Positive|Neutral|Negative",
    "behavioral_traits": ["trait1", ...],
    "feedback": "Detailed feedback"
}}"""
            
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return self._default_analysis()
        except Exception as e:
            logger.error(f"Error analyzing interview session: {e}")
            return self._default_analysis()

    def extract_key_moments(self, transcript: str) -> List[Dict[str, Any]]:
        """Extract key moments from interview transcript"""
        try:
            prompt = f"Extract key moments from this interview transcript: {transcript[:2000]}"
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return []
        except Exception as e:
            logger.error(f"Error extracting moments: {e}")
            return []

    def analyze_interview(self, transcript: str, interview_details: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze interview matching orchestrator signature"""
        return self.analyze_interview_session(transcript, interview_details.get('job_title', ''))

    def analyze_answer_quality(self, question: str, answer: str) -> Dict[str, Any]:
        """Analyze individual interview answer"""
        try:
            prompt = f"Analyze this answer: Question: {question}\nAnswer: {answer}"
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"analysis": "Unable to analyze"}
        except Exception as e:
            logger.error(f"Error analyzing answer: {e}")
            return {"error": str(e)}

    def predict_performance(self, interview_data: Dict[str, Any]) -> Dict[str, Any]:
        """Predict on-job performance based on interview"""
        try:
            prompt = f"Predict on-job performance based on this data: {json.dumps(interview_data)}"
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"prediction": "Unable to predict"}
        except Exception as e:
            logger.error(f"Error predicting performance: {e}")
            return {"error": str(e)}

    def extract_speaking_patterns(self, transcript: str) -> Dict[str, Any]:
        """Analyze speaking patterns from interview"""
        try:
            prompt = f"Analyze speaking patterns from this transcript: {transcript[:2000]}"
            response_text = llm_manager.generate_completion('VIDEO_AUDIO_INTERVIEW', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"patterns": "Unable to analyze"}
        except Exception as e:
            logger.error(f"Error analyzing patterns: {e}")
            return {"error": str(e)}

    def _default_analysis(self) -> Dict[str, Any]:
        return {"overall_score": 0, "communication_score": 0, "technical_score": 0, "cultural_fit_score": 0, "strengths": [], "weaknesses": [], "feedback": "Unable to analyze"}
