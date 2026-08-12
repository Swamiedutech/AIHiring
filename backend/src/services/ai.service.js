const axios = require('axios');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const scoringService = require('./scoring.service');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5001';
const keyRotator = require('../utils/keyRotator');
const llmService = require('./llm.service');

/**
 * Gets a fresh model instance with a rotated API key
 */
const getModel = () => {

  const key = keyRotator.getNextKey();
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: process.env.GENAI_MODEL || "gemini-2.0-flash" });
};



const aiServiceClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 45000, // Increased timeout for heavy AI tasks
});

/**
 * Global Sanitization: Strips markdown characters (asterisks, etc.) from AI-generated content
 */
const sanitizeAIOutput = (obj) => {
  if (typeof obj === 'string') return obj.replace(/\*\*/g, '').replace(/\*/g, '').trim();
  if (Array.isArray(obj)) return obj.map(sanitizeAIOutput);
  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (let key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = sanitizeAIOutput(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
};

/**
 * Resume parsing integration
 */
const parseResumeWithAI = async (filePath, jobContext = {}) => {
  try {
    // 1. Try Remote AI Service first (Flask)
    logger.info(`[AI Service] Attempting remote parse via ${AI_SERVICE_URL}`);

    const formData = new FormData();
    const fs = require('fs');
    if (!fs.existsSync(filePath)) throw new Error("File not found for parsing");

    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream);

    // Pass job context for role-specific scoring
    if (jobContext.title) formData.append('job_title', jobContext.title);
    if (jobContext.description) formData.append('job_description', jobContext.description.substring(0, 1000));
    if (jobContext.skills && Array.isArray(jobContext.skills)) {
      formData.append('job_skills', JSON.stringify(jobContext.skills));
    }

    const response = await aiServiceClient.post('/api/ai/resume/parse', formData, {
      headers: formData.getHeaders(),
    });

    if (response.data && response.data.success) {
      logger.info("[AI Service] Remote parse successful");
      return response.data.data;
    }
    throw new Error("Remote service returned unsuccessful response");

  } catch (error) {
    logger.warn(`[AI Service] Remote parse failed: ${error.message}. Attempting Direct Gemini Parse...`);

    // 2. Try Direct Gemini Parse from Node (Secondary Pipeline)
    try {
      return await parseResumeWithGeminiDirect(filePath, jobContext);
    } catch (geminiError) {
      logger.error(`[AI Service] Direct Gemini parse also failed: ${geminiError.message}. Falling back to local ML parser.`);
      // 3. Last Resort: Local ML Parser
      const localData = await localResumeParser(filePath);
      return {
        ...localData,
        total_years_experience: localData.experience_years || 0
      };
    }
  }
};


/**
 * Direct Gemini Resume Parser (Node-based secondary pipeline)
 */
const parseResumeWithGeminiDirect = async (filePath, jobContext = {}) => {
  try {
    const fs = require('fs');
    const { PDFParse } = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);

    let text = "";
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const pdfInstance = new PDFParse({ data: dataBuffer });
      const textResult = await pdfInstance.getText();
      text = textResult.text;
    } else {
      text = dataBuffer.toString('utf-8');
    }

    // Build job context for role-specific scoring
    const jobContextText = jobContext.title ? `
TARGET JOB ROLE: ${jobContext.title}
REQUIRED SKILLS: ${(jobContext.skills || []).join(', ')}
Evaluate ALL insights specifically for this role.
` : '';

    const prompt = `
            Task: Parse the following resume and return a structured JSON object.${jobContextText}
            
            Resume Text:
            ${text.substring(0, 4000)}

            Required JSON Format (fill all fields accurately):
            {
                "contact_info": { "email": "", "phone": "", "name": "" },
                "skills": ["skill1", "skill2"],
                "experience_years": 0,
                "candidate_type": "FRESHER or WORKING_PROFESSIONAL",
                "overall_score": 0-100,
                "summary": "Role-specific professional summary",
                "highest_qualification": "degree name e.g. B.Tech in CS or null",
                "education": [{ "degree": "", "specialization": "", "institution": "", "year_of_passout": "", "cgpa": null }],
                "location": "City, State extracted from resume or null",
                "domain": "Primary professional domain e.g. Software Engineering, Marketing, Data Science, Mechanical Engineering or null",
                "area_of_interest": "For freshers: research interests or project focus areas or null",
                "current_company": "Most recent employer name if working professional, else null",
                "working_address": "Office/work location from resume if mentioned, else null",
                "strengths": ["role-specific strength 1", "strength 2", "strength 3", "strength 4", "strength 5"],
                "weaknesses": ["role-specific weakness 1", "weakness 2", "weakness 3", "weakness 4", "weakness 5"],
                "role_fit": { "fit_level": "High/Medium/Low", "explanation": "role-specific fit explanation" }
            }
            
            CRITICAL RULES:
            - If candidate has NO work experience of any kind, set experience_years=0 and candidate_type=FRESHER
            - If candidate has ANY work experience (including internships, part-time, or full-time roles), set candidate_type=WORKING_PROFESSIONAL and extract current_company (or most recent internship company)
            - If experience is less than 1 year (e.g. short internships), set experience_years=1 (minimum for professionals)
            - If highest_qualification cannot be found, set it to null (do not guess)
            - Extract CGPA/GPA/percentage from education section if available
            - Extract location/city from contact or address info if available
            - All strengths/weaknesses must be relevant to the target job role if specified
        `;

    const responseText = await llmService.generateCompletion('RESUME_SCORING', prompt);
    const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
    const sanitized = sanitizeAIOutput(parsed);
    return {
      ...sanitized,
      experience_years: sanitized.candidate_type === 'FRESHER' ? 0 : (sanitized.experience_years || 0),
      total_years_experience: sanitized.candidate_type === 'FRESHER' ? 0 : (sanitized.experience_years || 0)
    };
  } catch (e) {
    logger.error(`[Gemini Direct] Failed: ${e.message}`);
    throw e;
  }
};


/**
 * Local ML-based Resume Parser (Iterative Fallback)
 */
const localResumeParser = async (filePath) => {
  try {
    const fs = require('fs');
    const { PDFParse } = require('pdf-parse');
    let text = "";

    try {
      const dataBuffer = fs.readFileSync(filePath);
      if (filePath.toLowerCase().endsWith('.pdf')) {
        const pdfInstance = new PDFParse({ data: dataBuffer });
        const textResult = await pdfInstance.getText();
        text = textResult.text;
      } else {
        text = dataBuffer.toString('utf-8');
      }
    } catch (readErr) {
      logger.warn(`Local parser text extraction failed: ${readErr.message}`);
      text = "Text extraction failed";
    }

    const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
    const phone = text.match(/(\+?\d{1,3}[- ]?)?\d{10}/)?.[0];

    const commonSkills = ["React", "Node.js", "Java", "Python", "SQL", "Docker", "AWS", "SAP", "Quality Control", "Production", "Marketing", "Supply Chain"];
    const foundSkills = commonSkills.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(text));

    const cgpaMatch = text.match(/CGPA[\s:]*([0-9.]+)/i);
    // CRITICAL FIX: Do NOT default experience to 2 - freshers have 0 years
    const experience = text.match(/(\d+)\+?\s*(years?|yrs?)/i)?.[1] || 0;

    return {
      contact_info: { email, phone },
      skills: foundSkills,
      experience_years: parseInt(experience),
      total_years_experience: parseInt(experience),
      overall_score: 65,
      summary: "Extracted via Local Semantic Pipeline (AI Fallback Active)",
      highest_qualification: null, // Cannot reliably detect without AI
      education: [{ degree: cgpaMatch ? "Detected Degree" : null, cgpa: cgpaMatch?.[1] }],
      strengths: ["Clear professional background", "Documented technical skills", "Structured profile layout"],
      weaknesses: ["Deep AI analysis unavailable for this file format", "Verify certifications manually"],
      role_fit: { fit_level: "Moderate", explanation: "Matched against core industrial keywords." }
    };
  } catch (e) {
    logger.error(`[Local Parser] Critical Failure: ${e.message}`);
    return { skills: [], summary: "Parsing Failed", overall_score: 0, strengths: [], weaknesses: [] };
  }
};

/**
 * Score resume against job requirements
 */
const scoreResume = async (parsedResume, jobRequirements) => {
  try {
    // jobRequirements can be either a job object {required_skills, description} or a string/number job ID
    let reqObj = jobRequirements;
    if (typeof jobRequirements === 'string' || typeof jobRequirements === 'number') {
      // Legacy: look up job by ID
      try {
        const { Job } = require('../models');
        const job = await Job.findByPk(jobRequirements);
        reqObj = job ? { required_skills: job.required_skills || [], description: job.description || job.title || '' } : {};
      } catch (e) {
        reqObj = {};
      }
    }

    const jdSkillsText = (reqObj.required_skills?.join(' ') || reqObj.description || '').toLowerCase();
    const candSkills = parsedResume.skills ? (Array.isArray(parsedResume.skills) ? parsedResume.skills : Object.values(parsedResume.skills).flat()) : [];

    const skillMatch = scoringService.matchSkills(jdSkillsText, candSkills);
    const resumeText = JSON.stringify(parsedResume).toLowerCase();
    const cosineScore = scoringService.calculateCosineSimilarity(jdSkillsText, resumeText);

    // Higher weight for skill match in JD scoring
    const finalFitScore = Math.round((skillMatch.matchPercentage * 0.7) + (cosineScore * 30));

    return {
      overall_fit_percentage: finalFitScore,
      matched_skills: skillMatch.matched,
      missing_skills: skillMatch.missing,
      cosine_similarity: cosineScore,
      analysis: `Skill Match: ${skillMatch.matchPercentage}%, Semantic Alignment: ${Math.round(cosineScore * 100)}%`
    };
  } catch (error) {
    logger.error(`Scoring Error: ${error.message}`);
    return { overall_fit_percentage: 0, matched_skills: [], missing_skills: [] };
  }
};


/**
 * Analyze Assessment Response (Hybrid Gemini + Local Semantic)
 */
const analyzeAssessmentResponse = async (assessmentData) => {
  try {
    const { question, answer, category, expectedAnswer, keywords } = assessmentData;

    // 1. Initial Local Semantic Score (Cosine Similarity)
    // If we have an expected answer, compare against that. Otherwise compare against the question context.
    const referenceText = expectedAnswer || question;
    const localSemanticScore = scoringService.calculateCosineSimilarity(referenceText, answer);
    const baselineScore = Math.round(localSemanticScore * 100);

    // 2. Call Remote AI for Behavioral/Deep Technical Insights
    if (!AI_SERVICE_URL.includes('localhost:5000')) {
      const response = await aiServiceClient.post('/api/ai/assessment/analyze', {
        question,
        answer,
        category,
        expectedAnswer,
        keywords
      });
      return {
        score: response.data?.score || baselineScore,
        insights: response.data?.insights || "Analysis completed via Neural Engine."
      };
    }

    // Local Fallback Logic: Boost score if keywords are found
    let finalScore = baselineScore;
    if (keywords && Array.isArray(keywords)) {
      const foundCount = keywords.filter(k => answer.toLowerCase().includes(k.toLowerCase())).length;
      const keywordBoost = (foundCount / keywords.length) * 20;
      finalScore = Math.min(100, finalScore + keywordBoost);
    }

    return {
      score: finalScore,
      insights: "Local semantic analysis performed. Keyword density weighted."
    };

  } catch (err) {
    logger.warn(`Assessment AI Analysis failed: ${err.message}. Falling back to ML baseline.`);
    return { score: 70, insights: "Baseline fallback active." };
  }
};

/**
 * Analyze Interview
 */
/**
 * Analyze Interview using Deep AI
 */
const analyzeInterview = async (transcript, interviewDetails = {}) => {
  const { type = 'technical', questions = [], jobTitle = 'the role', jobSkills = [] } = interviewDetails;

  const jobContext = jobTitle !== 'the role' ? `
Job Role Being Evaluated: ${jobTitle}
Required Skills for This Role: ${jobSkills.slice(0, 10).join(', ')}
CRITICAL: All analysis, strengths, weaknesses, and recommendations must be SPECIFIC to the "${jobTitle}" role.
` : '';

  const prompt = `
    Task: Deep AI Interview Analysis for AI Hiring System Recruitment.
    Interview Type: ${type}
    ${jobContext}
    Context Questions: ${JSON.stringify(questions)}
    Transcript: ${transcript.substring(0, 8000)}

    Analyze the transcript comprehensively. Evaluate the candidate's fitness for ${jobTitle}.
    Provide scores (0-100), role-specific green/red flags, and hiring recommendations.
    DO NOT use markdown formatting (no asterisks **). Return plain text only.

    Required JSON Schema:
    {
      "overall_assessment": {
        "overall_score": 0-100,
        "summary": "Role-specific assessment summary for ${jobTitle}",
        "key_takeaways": ["role-specific takeaway 1", "takeaway 2"],
        "next_round_readiness": true/false
      },
      "qa_analyses": [
        { "question": "string", "answer_summary": "string", "technical_depth": 0-10, "communication_clarity": 0-10 }
      ],
      "metrics": {
        "technical_knowledge": 0-100,
        "communication": 0-100,
        "problem_solving": 0-100,
        "soft_skills": 0-100,
        "cultural_fit": 0-100
      },
      "speaking_patterns": {
        "confidence_level": "high | moderate | low",
        "pace": "steady | fast | slow",
        "clarity": "clear | average | poor",
        "hesitation_level": "low | medium | high"
      },
      "green_flags": ["role-relevant positive indicator 1", "indicator 2"],
      "red_flags": ["role-relevant concern 1", "concern 2"],
      "weaknesses": ["specific weakness relevant to ${jobTitle}", "weakness 2"],
      "recommendation": "strong_yes | yes | maybe | no",
      "performance_prediction": {
        "predicted_on_job_performance": "exceptional | strong | average | risk",
        "time_to_productivity_months": 1-12,
        "retention_probability_percentage": 0-100
      }
    }
  `;

  try {
    const responseText = await llmService.generateCompletion('INTERVIEW_ANALYSIS', prompt);
    const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
    return sanitizeAIOutput(parsed);
  } catch (error) {
    logger.error(`AI Interview Analysis Error: ${error.message}`);
    // Deterministic fallback
    const semanticScore = scoringService.calculateCosineSimilarity("professionalism experience knowledge", transcript);
    const score = Math.round(semanticScore * 100);

    return {
      overall_assessment: {
        overall_score: score,
        summary: `Semantic fallback analysis for ${jobTitle}. AI service interrupted.`,
        key_takeaways: ["Candidate provided structured responses"]
      },
      metrics: { technical_knowledge: score, communication: 70, problem_solving: 60, soft_skills: 70, cultural_fit: 60 },
      weaknesses: [`Limited data for ${jobTitle} role evaluation`],
      recommendation: score > 60 ? 'yes' : 'maybe'
    };
  }
};


/**
 * Generate Resume Summary (AI-enhanced)
 */
const generateResumeSummary = async (parsedData, jobContext = {}) => {
  try {
    const skills = Array.isArray(parsedData.skills) ? parsedData.skills.join(', ') :
      (typeof parsedData.skills === 'object' ? Object.values(parsedData.skills).flat().join(', ') : 'Various technical domains');
    const exp = parsedData.total_years_experience || parsedData.experience_years || 0;
    const qual = parsedData.highest_qualification || 'Not specified';
    const candidateType = parsedData.candidate_type || (exp === 0 ? 'FRESHER' : 'WORKING_PROFESSIONAL');

    // Build role-specific prompt
    const roleContext = jobContext.title ? `
TARGET JOB ROLE: ${jobContext.title}
REQUIRED SKILLS: ${(jobContext.skills || []).slice(0, 10).join(', ')}
All insights must be evaluated against this specific role.` : '';

    const prompt = `
            Task: Generate a role-specific executive summary and analysis for a candidate.
            ${roleContext}
            
            Candidate Data:
            - Candidate Type: ${candidateType}
            - Experience: ${exp === 0 ? 'Fresher (0 years)' : exp + ' years'}
            - Skills: ${skills}
            - Highest Qualification: ${qual}
            - Top Achievements: ${parsedData.key_achievements?.join(', ') || 'N/A'}
            
            ${jobContext.title ? `Evaluate the candidate SPECIFICALLY for the role: ${jobContext.title}` : 'Provide a general professional evaluation.'}
            
            Return a JSON object:
            {
                "executive_summary": "A 2-3 sentence professional summary that explicitly mentions fit/gap for the target role",
                "key_strengths": ["List 5 role-specific strengths"],
                "weaknesses": ["List 3-5 role-specific areas for growth or gaps"],
                "recommended_improvements": ["What the candidate should add or improve for this role"],
                "jd_match_analysis": "1-2 sentences on how well the candidate matches the JD",
                "education_highlight": "${qual} - brief note on relevance to the role"
            }
        `;

    try {
      const responseText = await llmService.generateCompletion('RESUME_SCORING', prompt);
      const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      return sanitizeAIOutput(parsed);
    } catch (llmErr) {
      logger.warn(`LLM Summary generation failed: ${llmErr.message}. Using structured fallback.`);
      return {
        executive_summary: candidateType === 'FRESHER'
          ? `Fresher candidate with strong academic background in ${qual}. Skills include ${skills.substring(0, 80)}. Interested in ${jobContext.title || 'the applied role'}.`
          : `Candidate with ${exp} years of experience. Core competencies: ${skills.substring(0, 100)}.`,
        key_strengths: parsedData.strengths?.length > 0 ? parsedData.strengths : ["Academic background", "Technical skill awareness", "Growth potential"],
        weaknesses: parsedData.weaknesses?.length > 0 ? parsedData.weaknesses : ["Limited professional experience", "Verify certifications manually"],
        recommended_improvements: ["Add specific project impact metrics", "Highlight role-specific skills"],
        jd_match_analysis: `Candidate's profile has been evaluated against ${jobContext.title || 'the role'}.`,
        education_highlight: qual || 'Qualification not detected — please review resume manually'
      };
    }
  } catch (e) {
    logger.error(`[Summary Generator] Critical Error: ${e.message}`);
    return {
      executive_summary: "Error generating summary.",
      key_strengths: [],
      weaknesses: [],
      recommended_improvements: []
    };
  }
};


/**
 * Generate Interview Summary
 */
const generateInterviewSummary = async (transcript, score) => {
  return `The candidate demonstrated a ${score > 70 ? 'strong' : 'moderate'} grasp of professional concepts. Transcript analysis indicates active engagement with a focus score of ${score}%.`;
};

module.exports = {
  parseResumeWithAI,
  scoreResume,
  analyzeAssessmentResponse,
  analyzeInterview,
  generateResumeSummary,
  generateInterviewSummary,
  healthCheck: async () => ({ status: "UP", mode: AI_SERVICE_URL.includes('localhost') ? "LOCAL_ML" : "REMOTE_AI" }),

  /**
   * Module 1: Advanced Answer Analysis
   */
  evaluateTechnicalAnswer: async (question, answer, expectedAnswer, keywords) => {
    // If answer is empty/blank, skip AI call and return honest 0-score
    const trimmedAnswer = (answer || '').trim();
    if (!trimmedAnswer || trimmedAnswer.length < 5) {
      return {
        score: 0,
        structure_score: 0,
        concept_coverage: 0,
        explanation: "No answer was provided for this question.",
        strengths: [],
        weaknesses: ["No answer provided for evaluation."]
      };
    }

    const prompt = `
      Task: Evaluate technical response for AI Hiring System recruitment assessment.
      Question: ${question}
      Candidate Answer: ${trimmedAnswer}
      Expected Answer Reference: ${expectedAnswer || 'N/A'}
      Key Scoring Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : 'N/A'}
      
      Score based on: relevance, completeness, and keyword coverage.
      Return ONLY valid JSON, no markdown.
      Output Format: { 
        "score": number (0-100), 
        "structure_score": number (0-100), 
        "concept_coverage": number (0-100), 
        "explanation": "string",
        "strengths": ["string"],
        "weaknesses": ["string"]
      }
    `;
    try {
      const responseText = await llmService.generateCompletion('INTERVIEW_ANALYSIS', prompt);
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return sanitizeAIOutput(parsed);
    } catch (err) {
      logger.warn(`AI Technical Evaluation Error: ${err.message}. Using keyword-based scoring.`);
      // Keyword-based fallback scoring
      const kws = Array.isArray(keywords) ? keywords : [];
      const matchedKws = kws.filter(kw => trimmedAnswer.toLowerCase().includes(kw.toLowerCase()));
      const kwScore = kws.length > 0 ? Math.round((matchedKws.length / kws.length) * 70) : 30;
      return {
        score: kwScore,
        structure_score: trimmedAnswer.length > 100 ? 40 : 20,
        concept_coverage: kwScore,
        explanation: `Keyword-based evaluation (AI unavailable). Matched ${matchedKws.length}/${kws.length} keywords.`,
        strengths: matchedKws.length > 0 ? [`Keywords matched: ${matchedKws.join(', ')}`] : ["Answer provided"],
        weaknesses: kwScore < 50 ? ["Key concepts not sufficiently addressed"] : []
      };
    }
  },


  /**
   * Module 2: Full Interview Analysis
   */
  analyzeFullInterview: async (qaPairs, jobTitle) => {
    const roleCtx = jobTitle ? `Role being evaluated: ${jobTitle}. All scoring must be specific to this role.` : '';
    const prompt = `
      Task: Analyze Video Interview for ${jobTitle || 'the applied role'}.
      ${roleCtx}
      Data: ${JSON.stringify(qaPairs)}
      
      Evaluate the candidate's fitness for this SPECIFIC role.
      DO NOT use markdown formatting. Return plain text only.
      
      Output Format (JSON): { 
        "dimension_scores": { "technical": 0-100, "communication": 0-100, "confidence": 0-100, "soft_skills": 0-100, "integrity": 0-100 }, 
        "overall_interview_score": 0-100, 
        "highlights": { "summary": "Role-specific assessment summary" },
        "strengths": ["role-specific strength 1", "strength 2"],
        "weaknesses": ["role-specific gap 1", "gap 2"],
        "recommendation": "Strong Hire | Hire | Hold | Reject"
      }
    `;
    try {
      const responseText = await llmService.generateCompletion('INTERVIEW_ANALYSIS', prompt);
      const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      return sanitizeAIOutput(parsed);
    } catch (err) {
      logger.warn(`AI Full Interview Analysis Error: ${err.message}`);
      return {
        overall_interview_score: 50,
        highlights: { summary: `The AI interview analysis for ${jobTitle || 'this role'} was interrupted. Please review the transcript manually.` },
        dimension_scores: { technical: 50, communication: 50, confidence: 50 },
        strengths: ["Candidate completed the interview session"],
        weaknesses: ["Full AI evaluation unavailable — manual review required"]
      };
    }
  },


  /**
   * Module 4: Final Recommendation Engine
   * Generates the executive hiring decision and role fit analysis
   */
  getFinalCandidateDecision: async (metrics) => {
    const {
      jobId,
      assessmentScore,
      interviewScore,
      integrityScore,
      behavioralScore,
      resumeScore,
      jobTitle = "the specified role",
      candidateName = "this candidate"
    } = metrics;

    // Default weights
    let weights = { assessment: 0.35, interview: 0.35, integrity: 0.1, behavioral: 0.1, resume: 0.1 };

    if (jobId) {
      try {
        const { AIConfig } = require('../models');
        const dbConfig = await AIConfig.findOne({ where: { jobId: String(jobId), status: 'ACTIVE' } });
        if (dbConfig) {
          const totalBase = (dbConfig.mcqWeight + dbConfig.technicalWeight + dbConfig.interviewWeight) || 1;
          weights.assessment = (dbConfig.mcqWeight + dbConfig.technicalWeight) / totalBase * 0.7;
          weights.interview = dbConfig.interviewWeight / totalBase * 0.7;
          weights.integrity = 0.1;
          weights.behavioral = 0.1;
          weights.resume = 0.1;
        }
      } catch (e) {
        logger.warn(`Failed to fetch AI weights for job ${jobId}, using defaults.`);
      }
    }

    const finalScore = Math.round(
      (assessmentScore * weights.assessment) +
      (interviewScore * weights.interview) +
      (integrityScore * weights.integrity) +
      (behavioralScore * weights.behavioral) +
      ((resumeScore || 0) * weights.resume)
    );

    // Derive fit dimensions from available scores
    const technicalFit = Math.round((assessmentScore * 0.7) + (interviewScore * 0.3));
    const commFit = Math.round((interviewScore * 0.6) + (behavioralScore * 0.4));
    const leadershipFit = Math.round((behavioralScore * 0.5) + (interviewScore * 0.3) + (assessmentScore * 0.2));
    const domainFit = Math.round((assessmentScore * 0.6) + ((resumeScore || 0) * 0.4));
    const culturalFit = Math.round((behavioralScore * 0.6) + (integrityScore * 0.4));

    const prompt = `
      Task: Generate Final Hiring Decision for AI Hiring System Recruitment System.
      Role: ${jobTitle}
      Candidate: ${candidateName}
      
      Performance Metrics (all scores out of 100):
      - Technical Assessment Score: ${assessmentScore}
      - AI Interview Performance: ${interviewScore}
      - Resume/Profile Score: ${resumeScore || 'Not evaluated'}
      - Integrity & Security Index: ${integrityScore}
      - Behavioral & Cultural Score: ${behavioralScore}
      - Computed Weighted Score: ${finalScore}

      Pre-computed Fit Estimates:
      - Technical Fit: ${technicalFit}
      - Communication Fit: ${commFit}
      - Leadership Fit: ${leadershipFit}
      - Domain Expertise Fit: ${domainFit}
      - Cultural Fit: ${culturalFit}

      Instructions:
      - Base your decision strictly on the above metrics
      - "Comm Fit" = Communication Fitness derived from interview articulation + behavioral score
      - Use "Strong Hire" only if weighted score >= 70
      - Use "Hire" if weighted score 55-69
      - Use "Borderline" if weighted score 40-54
      - Use "Reject" if weighted score < 40
      - role_recommendation must be role-specific for: ${jobTitle}
      - DO NOT use markdown. Return plain text values only.
      
      Required JSON Schema (numbers only, no units):
      {
        "decision": "Strong Hire | Hire | Borderline | Reject",
        "role_recommendation": "Specific 1-2 sentence recommendation for ${jobTitle} capacity.",
        "fit_breakdown": {
          "technical": 0-100,
          "communication": 0-100,
          "leadership": 0-100,
          "domain_expertise": 0-100,
          "cultural_fit": 0-100
        },
        "reasoning": "Professional 2-3 sentence executive rationale citing specific scores.",
        "key_strengths": ["strength1", "strength2", "strength3"],
        "development_areas": ["area1", "area2"],
        "success_prediction_percentage": 0-100
      }
    `;

    try {
      const responseText = await llmService.generateCompletion('BIAS_SAFE_HR', prompt);
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return { ...sanitizeAIOutput(parsed), final_score: finalScore };
    } catch (err) {
      logger.error(`[AI Decision Core] Execution Error: ${err.message}`);
      // Deterministic fallback — use actual computed scores, not hardcoded 50
      const autoDecision = finalScore >= 70 ? 'Strong Hire' : finalScore >= 55 ? 'Hire' : finalScore >= 40 ? 'Borderline' : 'Reject';
      return {
        decision: autoDecision,
        role_recommendation: `Based on computed metrics (Score: ${finalScore}/100), candidate shows ${autoDecision === 'Strong Hire' || autoDecision === 'Hire' ? 'sufficient' : 'insufficient'} alignment for the ${jobTitle} role. Manual HR review recommended for final confirmation.`,
        fit_breakdown: {
          technical: technicalFit,
          communication: commFit,
          leadership: leadershipFit,
          domain_expertise: domainFit,
          cultural_fit: culturalFit
        },
        reasoning: `Deterministic scoring applied (AI unavailable). Assessment: ${assessmentScore}%, Interview: ${interviewScore}%, Integrity: ${integrityScore}%. Weighted final: ${finalScore}/100.`,
        key_strengths: assessmentScore > 60 ? [`Strong technical assessment (${assessmentScore}%)`] : [`Completed full assessment pipeline`],
        development_areas: assessmentScore < 60 ? [`Technical depth for ${jobTitle}`] : [],
        success_prediction_percentage: finalScore,
        final_score: finalScore
      };
    }
  },

  /**
   * Module 5: Strategic System Report
   */
  generateSystemReport: async (stats) => {
    const prompt = `
      Task: Generate Strategic AI Recruitment Report for AI Hiring System.
      Stats Data: ${JSON.stringify(stats)}
      
      Generate a professional executive summary, trend analysis, and strategic recommendations.
      Return JSON format: { "title": "", "summary": "", "sections": [{ "heading": "", "content": "" }], "conclusion": "" }
    `;
    try {
      const responseText = await llmService.generateCompletion('LOW_COST_SCALING', prompt);
      const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      return sanitizeAIOutput(parsed);
    } catch (err) {
      return { title: "AI Report Error", summary: "Failed to generate report using AI." };
    }
  },

  /**
   * Module 6: Specific Section Insight Generator
   */
  generateStrategicInsight: async (section, data) => {
    const prompt = `
      Task: Generate a Strategic Recruitment Insight for the section: "${section}".
      Context Data: ${JSON.stringify(data)}
      
      Requirements:
      - Use professional recruitment language.
      - Base the insight on the provided data trends.
      - For "Talent Intelligence", identify correlations.
      - For "Predictive Analytics", provide probability-based rationale.
      - For "Recommendations", give actionable advice.
      
      Return a concise JSON object:
      {
        "title": "Short title",
        "content": "A 2-3 sentence strategic insight based on data.",
        "impact": "High | Moderate | Low",
        "action_item": "Suggested next step"
      }
    `;
    try {
      const responseText = await llmService.generateCompletion('LOW_COST_SCALING', prompt);
      const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());
      return sanitizeAIOutput(parsed);
    } catch (err) {
      logger.error(`[AI Insight Generator] Error: ${err.message}`);
      return {
        title: `${section} Insight`,
        content: "The AI is currently analyzing recent data trends. Please check back shortly.",
        impact: "Moderate"
      };
    }
  },

  /**
   * Module 7: Candidate Chatbot
   */
  chatWithAI: async (message, history = []) => {
    const prompt = `
      Task: AI Recruitment Assistant for AI Hiring System.
      Role: Help the candidate with their application, interview, or assessment queries.
      Context: You are professional, helpful, and concise.
      
      Chat History:
      ${JSON.stringify(history)}
      
      User Message: ${message}
      
      Response (Plain Text):
    `;
    try {
      return await llmService.generateCompletion('CANDIDATE_CHATBOT', prompt);
    } catch (err) {
      logger.error(`[AI Chat] Error: ${err.message}`);
      return "I apologize, but I'm having trouble connecting to my brain right now. Please try again in a moment.";
    }
  }
};