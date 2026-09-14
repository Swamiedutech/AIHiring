"""
Assessment Analyzer Module
Analyzes technical assessments and coding challenges
"""
import os
import logging
import json
import re
from typing import Dict, List, Any, Optional
from google.genai import types
from dotenv import load_dotenv
from config import Config
from utils import strip_markdown, llm_manager

load_dotenv()
logger = logging.getLogger(__name__)

class AssessmentAnalyzer:
    """Analyze technical assessments and coding challenges"""
    
    def __init__(self):
        """Initialize the assessment analyzer"""
        logger.info("AssessmentAnalyzer initialized.")
    
    def analyze_coding_solution(self, code: str, problem_description: str) -> Dict[str, Any]:
        """Analyze a coding solution with industrial depth"""
        try:
            prompt = f"""Analyze this technical coding solution for industrial readiness:
Problem: {problem_description}
Code:
{code}

Provide a deep technical analysis in JSON format:
{{
    "overall_score": 0-100,
    "correctness_score": 0-100,
    "efficiency_score": 0-100,
    "code_quality_score": 0-100,
    "structure_score": 0-100,
    "concept_coverage": 0-100,
    "time_complexity": "O(?)",
    "space_complexity": "O(?)",
    "strengths": ["specific strength 1", "specific strength 2"],
    "weaknesses": ["specific weakness 1", "specific weakness 2"],
    "optimization_suggestions": ["suggestion 1", "suggestion 2"],
    "recommendations": ["industrial recommendation 1", "2"],
    "skill_level": "junior|mid-level|senior",
    "estimated_experience_years": 0-15,
    "detailed_feedback": "Comprehensive executive summary paragraph for HR."
}}"""
            
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return self._default_coding_analysis()
        except Exception as e:
            logger.error(f"Error analyzing coding solution: {e}")
            return self._default_coding_analysis()

    def analyze_mcq_test(self, questions: List[Dict[str, Any]], answers: List[str]) -> Dict[str, Any]:
        """Analyze MCQ responses for qualitative insights"""
        try:
            prompt = f"Analyze these MCQ responses for patterns and insights: {json.dumps({'questions': questions, 'answers': answers}, indent=2)}"
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"score_percentage": 0, "correct_answers": 0}
        except Exception as e:
            logger.error(f"Error in MCQ analysis: {e}")
            return {"score_percentage": 0, "error": str(e)}

    def analyze_system_design(self, design_doc: str, requirements: str) -> Dict[str, Any]:
        """Analyze system design document"""
        try:
            prompt = f"Analyze this system design: Requirements: {requirements}\nDesign: {design_doc}"
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"analysis": "Unable to analyze"}
        except Exception as e:
            logger.error(f"Error analyzing design: {e}")
            return {"error": str(e)}

    def analyze_case_study(self, case_description: str, solution: str) -> Dict[str, Any]:
        """Analyze case study response"""
        try:
            prompt = f"Analyze this case study solution: Case: {case_description}\nSolution: {solution}"
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"analysis": "Unable to analyze"}
        except Exception as e:
            logger.error(f"Error analyzing case study: {e}")
            return {"error": str(e)}

    def generate_assessment_report(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate final assessment report"""
        try:
            prompt = f"Generate a final executive report for this assessment: {json.dumps(assessment_data, indent=2)}"
            response_text = llm_manager.generate_completion('INTERVIEW_ANALYSIS', prompt)
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            return {"report": "Unable to generate report"}
        except Exception as e:
            logger.error(f"Error generating report: {e}")
            return {"error": str(e)}

    def _default_coding_analysis(self) -> Dict[str, Any]:
        return {
            "overall_score": 0, 
            "correctness_score": 0, 
            "efficiency_score": 0, 
            "code_quality_score": 0, 
            "structure_score": 0, 
            "concept_coverage": 0,
            "time_complexity": "N/A",
            "space_complexity": "N/A",
            "strengths": [], 
            "weaknesses": [], 
            "optimization_suggestions": [],
            "skill_level": "unknown",
            "detailed_feedback": "Analysis failed."
        }
