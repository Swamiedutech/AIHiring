"""
Resume Parser Module
Uses Google Generative AI and NLP for advanced resume parsing
Extracts structured information from resumes
"""
import os
import logging
import json
import re
from typing import Dict, List, Any, Optional, Tuple
import spacy
import nltk
from nltk.tokenize import sent_tokenize
import google.genai as genai
from google.genai import types
from dotenv import load_dotenv
from config import Config
from utils import extract_text_from_file, clean_text, extract_email, extract_phone, strip_markdown, llm_manager

load_dotenv()
logger = logging.getLogger(__name__)

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

class ResumeParser:
    """Parse resumes and extract structured information using AI"""
    
    # Skill categories
    SKILL_CATEGORIES = {
        'programming_languages': [
            'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Go', 'Rust',
            'PHP', 'Ruby', 'Swift', 'Kotlin', 'SQL', 'R', 'MATLAB', 'Scala',
            'Perl', 'Bash', 'PowerShell', 'Groovy'
        ],
        'web_frameworks': [
            'React', 'Vue.js', 'Angular', 'Django', 'Flask', 'FastAPI', 'Spring Boot',
            'Express.js', 'Next.js', 'Nuxt.js', 'Laravel', 'Symfony', 'ASP.NET',
            'Ruby on Rails', 'Node.js'
        ],
        'databases': [
            'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'Elasticsearch',
            'Oracle', 'SQL Server', 'DynamoDB', 'CosmosDB', 'Firebase', 'SQLite'
        ],
        'cloud_platforms': [
            'AWS', 'Azure', 'Google Cloud', 'Heroku', 'DigitalOcean', 'Alibaba Cloud',
            'Lambda', 'EC2', 'S3', 'CloudFront', 'RDS', 'AppEngine'
        ],
        'devops_tools': [
            'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI',
            'Terraform', 'Ansible', 'Nginx', 'Apache', 'Linux'
        ],
        'ai_ml': [
            'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Keras',
            'Scikit-learn', 'NLP', 'Computer Vision', 'OpenCV', 'YOLO', 'Hugging Face',
            'Generative AI', 'LLM', 'Transformer', 'BERT', 'GPT'
        ],
        'data_tools': [
            'Pandas', 'NumPy', 'Matplotlib', 'Seaborn', 'Plotly', 'Tableau', 'Power BI',
            'Apache Spark', 'Hadoop', 'Hive', 'Presto', 'dbt', 'Airflow'
        ],
        'soft_skills': [
            'Leadership', 'Communication', 'Problem Solving', 'Team Work', 'Project Management',
            'Agile', 'Scrum', 'Kanban', 'Adaptability', 'Critical Thinking', 'Negotiation'
        ]
    }
    
    EDUCATION_DEGREES = [
        'B.Tech', 'B.E', 'B.Sc', 'BCA', 'BA', 'B.Com',
        'M.Tech', 'M.E', 'M.Sc', 'MCA', 'MBA', 'MA', 'M.Com',
        'PhD', 'Ph.D', 'Diploma', 'B.S', 'M.S', 'B.A', 'M.A'
    ]
    
    SPECIALIZATIONS = [
        'Computer Science', 'Information Technology', 'Software Engineering',
        'Data Science', 'Artificial Intelligence', 'Machine Learning',
        'Electronics', 'Mechanical', 'Civil', 'Electrical',
        'Chemical', 'Biotechnology', 'Business', 'Finance', 'Commerce'
    ]
    
    def __init__(self):
        """Initialize the resume parser with AI"""
        self.model = Config.GENAI_MODEL or "gemini-2.0-flash"
        logger.info(f"ResumeParser initialized with model: {self.model}")
        
        # Load spaCy model
        try:
            self.nlp = spacy.load(Config.SPACY_MODEL)
        except OSError:
            logger.warning(f"Spacy model {Config.SPACY_MODEL} not found. Install with: python -m spacy download {Config.SPACY_MODEL}")
            self.nlp = None
    
    def parse_resume(self, file_path: str, job_title: str = None, job_description: str = None, job_skills: list = None) -> Dict[str, Any]:
        """
        Parse resume and extract all information
        
        Args:
            file_path: Path to resume file
            
        Returns:
            Dictionary with parsed resume data
        """
        try:
            # Extract text from file
            raw_text = extract_text_from_file(file_path)
            
            # Parse with AI (pass job context for role-specific scoring)
            parsed_data = self._parse_with_ai(raw_text, job_title=job_title, job_description=job_description, job_skills=job_skills)
            
            # Extract specific fields
            contact_info = self._extract_contact_info(raw_text)
            skills = self._extract_skills(raw_text)
            education = self._extract_education(raw_text)
            experience = self._extract_experience(raw_text)
            
            # Calculate total years of experience
            # Determine candidate type first
            candidate_type = parsed_data.get('candidate_type', '').upper()
            ai_exp_years = parsed_data.get('experience_years', 0)
            
            total_exp_years = 0
            if candidate_type == 'FRESHER':
                # Freshers always have 0 professional experience
                total_exp_years = 0
            elif experience:
                total_exp_years = max([exp.get('duration_years', 0) for exp in experience] + [ai_exp_years, 0])
            else:
                total_exp_years = ai_exp_years

            # Extract highest qualification from education list
            highest_qual = parsed_data.get('highest_qualification', None)
            if not highest_qual and education:
                degree_priority = ['PhD', 'M.Tech', 'M.E', 'M.Sc', 'MBA', 'MCA', 'M.S', 'M.A', 'M.Com',
                                   'B.Tech', 'B.E', 'B.Sc', 'BCA', 'B.S', 'B.A', 'B.Com', 'Diploma']
                for deg in degree_priority:
                    for edu in education:
                        if edu.get('degree', '').upper() == deg.upper() or deg.lower() in edu.get('degree', '').lower():
                            spec = edu.get('specialization', '')
                            highest_qual = f"{edu['degree']}{' in ' + spec if spec else ''}"
                            break
                    if highest_qual:
                        break
                if not highest_qual and education:
                    highest_qual = education[0].get('degree', None)

            # Merge AI detected skills with regex matched skills
            ai_skills = parsed_data.get('skills', [])
            if isinstance(ai_skills, list):
                if 'ai_detected' not in skills:
                    skills['ai_detected'] = []
                skills['ai_detected'] = list(set(skills.get('ai_detected', []) + ai_skills))
            elif isinstance(ai_skills, dict):
                for cat, sk_list in ai_skills.items():
                    if cat not in skills:
                        skills[cat] = []
                    skills[cat] = list(set(skills[cat] + sk_list))

            # Combine all data
            result = {
                'raw_text': raw_text,
                'contact_info': contact_info,
                'education': education,
                'experience': experience,
                'experience_timeline': parsed_data.get('experience_timeline', []),
                'experience_years': total_exp_years,
                'total_years_experience': total_exp_years,
                'skills': skills,
                'summary': parsed_data.get('summary'),
                'strengths': parsed_data.get('strengths', []),
                'weaknesses': parsed_data.get('weaknesses', []),
                'recommendations': parsed_data.get('recommendations', []),
                'overall_score': parsed_data.get('overall_score', 0),
                'role_fit': parsed_data.get('role_fit', {}),
                'key_achievements': self._extract_achievements(raw_text),
                'certifications': self._extract_certifications(raw_text),
                'languages': self._extract_languages(raw_text),
                'highest_qualification': highest_qual,
                'candidate_type': candidate_type or ('FRESHER' if total_exp_years == 0 else 'WORKING_PROFESSIONAL'),
                'location': parsed_data.get('location'),
                'domain': parsed_data.get('domain'),
                'area_of_interest': parsed_data.get('area_of_interest'),
                'current_company': parsed_data.get('current_company'),
                'working_address': parsed_data.get('working_address')
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing resume: {e}")
            raise
    
    def _parse_with_ai(self, text: str, job_title: str = None, job_description: str = None, job_skills: list = None) -> Dict[str, Any]:
        """Parse resume using Google Generative AI with job context for role-specific scoring"""
        try:
            # Redact PII (Emails and Phone numbers) to prevent privacy leaks to AI models
            redacted_text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[REDACTED_EMAIL]', text)
            redacted_text = re.sub(r'(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}', '[REDACTED_PHONE]', redacted_text)
            
            # Build job context block
            job_context = ""
            if job_title or job_description:
                skills_str = ', '.join(job_skills) if job_skills else 'Not specified'
                job_context = f"""
TARGET JOB ROLE: {job_title or 'Not specified'}
REQUIRED SKILLS FOR THIS ROLE: {skills_str}
JOB DESCRIPTION: {(job_description or '')[:500]}

IMPORTANT: Score the candidate SPECIFICALLY against this role. Strengths and weaknesses must reflect how well they fit THIS role, not their profile in general.
"""
            
            prompt = f"""Analyze this resume and provide detailed insights for the hiring decision:

{redacted_text[:3000]}

{job_context}

Provide the following in JSON format (ensure exactly 5 strengths and 5 weaknesses are provided).
CRITICAL: DO NOT use any markdown formatting like asterisks (**) or bolding in the text. Return plain text only.
If a job role is specified above, make ALL insights role-specific and relevant to that role.

CRITICAL RULES:
- If candidate has NO work experience of any kind, set experience_years=0 and candidate_type=FRESHER
- If candidate has ANY work experience (including internships, part-time, or full-time roles), set candidate_type=WORKING_PROFESSIONAL and extract current_company (or most recent internship company)
- If experience is less than 1 year (e.g. short internships), set experience_years=1 (minimum for professionals)
- If highest_qualification cannot be found, set it to null (do not guess)
- Extract CGPA/GPA/percentage from education section if available
- Extract location/city from contact or address info if available

{{
    "contact_info": {{ "email": "", "phone": "", "name": "" }},
    "summary": "Brief summary of candidate's fit for the role",
    "strengths": ["Role-specific strength 1", "Role-specific strength 2", "Role-specific strength 3", "Role-specific strength 4", "Role-specific strength 5"],
    "weaknesses": ["Role-specific weakness 1", "Role-specific weakness 2", "Role-specific weakness 3", "Role-specific weakness 4", "Role-specific weakness 5"],
    "recommendations": ["recommendation1", ...],
    "overall_score": 0-100,
    "key_insights": ["insight1", "insight2", ...],
    "role_fit": {{"technical_fit": 0-100, "cultural_fit": 0-100}},
    "experience_years": 0,
    "highest_qualification": "degree name e.g. B.Tech in CS or null",
    "education": [{{ "degree": "", "specialization": "", "institution": "", "year_of_passout": "", "cgpa": null }}],
    "experience_timeline": [{{ "title": "Role Name", "company": "Company Name", "duration": "Duration (e.g. Jun 2021 - Aug 2021)", "description": "Short description of what they did" }}],
    "location": "City, State extracted from resume or null",
    "domain": "Primary professional domain e.g. Software Engineering, Marketing, Data Science, Mechanical Engineering or null",
    "area_of_interest": "For freshers: research interests or project focus areas or null",
    "current_company": "Most recent employer name if working professional, else null",
    "working_address": "Office/work location from resume if mentioned, else null",
    "candidate_type": "FRESHER or WORKING_PROFESSIONAL"
}}"""
            
            logger.info(f"Sending prompt to Gemini: {prompt[:100]}...")
            response_text = llm_manager.generate_completion('RESUME_SCORING', prompt)
            
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                return strip_markdown(json.loads(json_match.group()))
            logger.info(f"Gemini response received: {response_text[:100]}...")
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            # Post-process to ensure 5 items and remove markdown
            result = json.loads(json_match.group()) if json_match else {}
            result = strip_markdown(result)
            
            # Helper to pad list to 5 items
            def pad_to_5(items, default_prefix):
                if not items: items = []
                while len(items) < 5:
                    items.append(f"{default_prefix} {len(items) + 1} identified from profile")
                return items[:5]

            result['strengths'] = pad_to_5(result.get('strengths'), "Strength")
            result['weaknesses'] = pad_to_5(result.get('weaknesses'), "Potential area for development")
            
            return result
            
        except Exception as e:
            logger.error(f"Error in AI parsing: {e}")
            return {
                'summary': 'Unable to generate AI summary',
                'strengths': [
                    "Profile parsed and matched",
                    "Skills alignment with role",
                    "Educational qualification met",
                    "Professional documentation",
                    "Clear career trajectory"
                ],
                'weaknesses': [
                    "Domain specific experience check recommended",
                    "Technical depth verification required",
                    "Soft skills assessment needed",
                    "Project impact metrics could be clearer",
                    "Relevant certifications verification"
                ],
                'recommendations': ["Schedule technical interview"],
                'overall_score': 50,
                'role_fit': {"technical_fit": 50, "cultural_fit": 50}
            }
    
    def _extract_contact_info(self, text: str) -> Dict[str, Optional[str]]:
        """Extract contact information"""
        return {
            'email': extract_email(text),
            'phone': extract_phone(text),
            'name': self._extract_name(text)
        }
    
    def _extract_name(self, text: str) -> Optional[str]:
        """Extract candidate name"""
        try:
            if self.nlp:
                doc = self.nlp(text[:500])
                for ent in doc.ents:
                    if ent.label_ == "PERSON":
                        return ent.text
        except Exception as e:
            logger.warning(f"Error extracting name: {e}")
        return None
    
    def _extract_skills(self, text: str) -> Dict[str, List[str]]:
        """Extract skills categorized by type"""
        text_lower = text.lower()
        skills = {}
        
        for category, skill_list in self.SKILL_CATEGORIES.items():
            found_skills = []
            for skill in skill_list:
                if skill.lower() in text_lower:
                    found_skills.append(skill)
            if found_skills:
                skills[category] = found_skills
        
        return skills
    
    def _extract_education(self, text: str) -> List[Dict[str, Any]]:
        """Extract education details"""
        education = []
        
        # Regex patterns for degrees to handle variations
        degree_patterns = [
            (r'\bB\.?Tech\b', 'B.Tech'),
            (r'\bB\.?E\b', 'B.E'),
            (r'\bM\.?Tech\b', 'M.Tech'),
            (r'\bM\.?E\b', 'M.E'),
            (r'\bB\.?Sc\b', 'B.Sc'),
            (r'\bM\.?Sc\b', 'M.Sc'),
            (r'\bB\.?S\b', 'B.S'),
            (r'\bM\.?S\b', 'M.S'),
            (r'\bB\.?A\b', 'B.A'),
            (r'\bM\.?A\b', 'M.A'),
            (r'\bB\.?Com\b', 'B.Com'),
            (r'\bM\.?Com\b', 'M.Com'),
            (r'\bBCA\b', 'BCA'),
            (r'\bMCA\b', 'MCA'),
            (r'\bMBA\b', 'MBA'),
            (r'\bM\.?B\.?A\b', 'MBA'),
            (r'\bBachelor\s+of\s+Technology\b', 'B.Tech'),
            (r'\bBachelor\s+of\s+Engineering\b', 'B.E'),
            (r'\bMaster\s+of\s+Technology\b', 'M.Tech'),
            (r'\bMaster\s+of\s+Engineering\b', 'M.E'),
            (r'\bBachelor\s+of\s+Science\b', 'B.Sc'),
            (r'\bMaster\s+of\s+Science\b', 'M.Sc'),
            (r'\bBachelor\s+of\s+Arts\b', 'B.A'),
            (r'\bMaster\s+of\s+Arts\b', 'M.A'),
            (r'\bDiploma\b', 'Diploma'),
            (r'\bPhD\b', 'PhD'),
            (r'\bPh\.?D\b', 'PhD'),
            (r'\bDoctor\s+of\s+Philosophy\b', 'PhD')
        ]
        
        found_degrees = []
        for pattern, degree_name in degree_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                if degree_name not in found_degrees:
                    found_degrees.append(degree_name)
                    
                    # Try to find associated specialization
                    spec = None
                    for specialization in self.SPECIALIZATIONS:
                        if re.search(r'\b' + re.escape(specialization) + r'\b', text, re.IGNORECASE):
                            spec = specialization
                            break
                    
                    education.append({
                        'degree': degree_name,
                        'specialization': spec,
                        'cgpa': self._extract_cgpa(text),
                        'year_of_passout': self._extract_year(text)
                    })
        
        return education
    
    def _extract_cgpa(self, text: str) -> Optional[float]:
        """Extract CGPA/GPA"""
        match = re.search(r'(?:CGPA|GPA|Percentage)[\s:]*([0-9.]+)', text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None
    
    def _extract_year(self, text: str) -> Optional[int]:
        """Extract graduation year"""
        match = re.search(r'(?:20|19)[0-9]{2}', text)
        if match:
            try:
                return int(match.group(0))
            except ValueError:
                return None
        return None
    
    def _extract_experience(self, text: str) -> List[Dict[str, Any]]:
        """Extract work experience"""
        experience = []
        
        # Look for experience keywords and details
        exp_pattern = r'(?:Experience|Work Experience|Professional Experience)(.*?)(?=Education|Skills|$)'
        matches = re.findall(exp_pattern, text, re.IGNORECASE | re.DOTALL)
        
        for match in matches:
            # Extract years of experience
            years_match = re.search(r'(\d+)\+?\s*years?', match, re.IGNORECASE)
            years = int(years_match.group(1)) if years_match else 0
            
            # Extract positions
            positions = re.findall(r'([A-Za-z\s]+(?:Engineer|Developer|Manager|Lead|Senior|Junior))', match)
            
            for position in positions:
                experience.append({
                    'position': position.strip(),
                    'duration_years': years
                })
        
        return experience
    
    def _extract_achievements(self, text: str) -> List[str]:
        """Extract key achievements"""
        achievements = []
        
        # Look for achievement keywords
        achievement_keywords = ['achieved', 'delivered', 'implemented', 'developed', 'led', 'increased', 'improved']
        sentences = sent_tokenize(text)
        
        for sentence in sentences:
            if any(keyword in sentence.lower() for keyword in achievement_keywords):
                achievements.append(sentence.strip())
        
        return achievements[:5]  # Return top 5
    
    def _extract_certifications(self, text: str) -> List[str]:
        """Extract certifications"""
        certifications = []
        cert_keywords = [
            'AWS', 'Azure', 'Google Cloud', 'Kubernetes', 'Docker',
            'PMP', 'Agile', 'SCRUM', 'Certified', 'Certificate'
        ]
        
        for keyword in cert_keywords:
            if keyword in text:
                certifications.append(keyword)
        
        return certifications
    
    def _extract_languages(self, text: str) -> List[str]:
        """Extract languages"""
        languages = []
        lang_keywords = [
            'English', 'Hindi', 'Spanish', 'French', 'German', 'Chinese',
            'Japanese', 'Russian', 'Arabic', 'Portuguese'
        ]
        
        for lang in lang_keywords:
            if lang in text:
                languages.append(lang)
        
        return languages
    
    def score_resume(self, parsed_data: Dict[str, Any], job_requirements: str) -> Dict[str, Any]:
        """
        Score resume against job requirements
        
        Args:
            parsed_data: Parsed resume data
            job_requirements: Job requirements text
            
        Returns:
            Scoring results
        """
        try:
            all_skills = set()
            for skill_list in parsed_data.get('skills', {}).values():
                all_skills.update(skill_list)
            
            prompt = f"""Score this resume against job requirements:

Resume Skills: {', '.join(all_skills)}
Resume Experience: {sum(exp.get('duration_years', 0) for exp in parsed_data.get('experience', []))} years

Job Requirements:
{job_requirements}

Provide in JSON format:
{{
    "skills_match_percentage": 0-100,
    "experience_match_percentage": 0-100,
    "overall_fit_percentage": 0-100,
    "missing_skills": ["skill1", ...],
    "matched_skills": ["skill1", ...],
    "rating": "excellent|good|fair|poor"
}}"""
            
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt
            )
            
            json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            
            return {
                'skills_match_percentage': 0,
                'experience_match_percentage': 0,
                'overall_fit_percentage': 0,
                'missing_skills': [],
                'matched_skills': [],
                'rating': 'poor'
            }
            
        except Exception as e:
            logger.error(f"Error scoring resume: {e}")
            return {
                'skills_match_percentage': 0,
                'overall_fit_percentage': 0,
                'rating': 'poor'
            }
