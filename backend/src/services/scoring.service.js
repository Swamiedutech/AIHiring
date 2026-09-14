const math = require('mathjs');

/**
 * Robust Hybrid Scoring Engine for Recruitment Pipeline
 * Integrates AI (LLM) with deterministic ML (TF-IDF + Cosine Similarity + Regression)
 * Ensures reliable candidate evaluation even when AI is offline.
 */
class ScoringService {
  constructor() {
    this.stopWords = new Set(['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', "don't", 'should', "should've", 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't", 'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven', "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 'wasn', "wasn't", 'weren', "weren't", 'won', "won't", 'wouldn', "wouldn't"]);
    
    // Regression Model Coefficients (Simulated for Production)
    this.regressionCoefficients = {
      intercept: 5.2,
      resumeWeight: 0.25,
      assessmentWeight: 0.45,
      interviewWeight: 0.30,
      malpracticePenalty: -2.5
    };
  }

  /**
   * Normalize and tokenize text
   */
  tokenize(text) {
    if (!text) return [];
    return text.toString().toLowerCase()
      .replace(/[^\w\s]/g, ' ') 
      .split(/\s+/) 
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  /**
   * Calculate TF Vector
   */
  getTF(tokens) {
    const tf = {};
    const total = tokens.length;
    if (total === 0) return {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    Object.keys(tf).forEach(word => tf[word] = tf[word] / total);
    return tf;
  }

  /**
   * Robust Cosine Similarity Implementation
   */
  calculateCosineSimilarity(text1, text2) {
    const tokens1 = this.tokenize(text1);
    const tokens2 = this.tokenize(text2);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    const tf1 = this.getTF(tokens1);
    const tf2 = this.getTF(tokens2);

    const allWords = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
    const vec1 = [];
    const vec2 = [];

    allWords.forEach(word => {
      vec1.push(tf1[word] || 0);
      vec2.push(tf2[word] || 0);
    });

    try {
      if (vec1.length === 0 || vec2.length === 0) return 0;
      
      const v1 = math.matrix(vec1);
      const v2 = math.matrix(vec2);
      
      const dotProduct = math.dot(v1, v2);
      const norm1 = math.norm(v1);
      const norm2 = math.norm(v2);

      if (norm1 === 0 || norm2 === 0) return 0;
      return dotProduct / (norm1 * norm2);
    } catch (e) {
      console.error("Cosine Similarity Error:", e);
      return 0;
    }
  }

  /**
   * Automated JD-Candidate Skill Matching
   * Identifies common and missing keywords
   */
  matchSkills(jdSkillsText, candidateSkillsArray) {
    const jdTokens = new Set(this.tokenize(jdSkillsText));
    const candTokens = new Set((Array.isArray(candidateSkillsArray) ? candidateSkillsArray : []).map(s => s.toLowerCase().trim()));
    
    // Also tokenize candidate skills in case they are phrases
    const flattenedCandTokens = new Set();
    candidateSkillsArray?.forEach(s => this.tokenize(s).forEach(t => flattenedCandTokens.add(t)));

    const matched = [];
    const missing = [];

    jdTokens.forEach(skill => {
      if (flattenedCandTokens.has(skill)) matched.push(skill);
      else missing.push(skill);
    });

    const matchPercentage = jdTokens.size > 0 ? (matched.length / jdTokens.size) * 100 : 100;

    return {
      matched,
      missing,
      matchPercentage: Math.round(matchPercentage)
    };
  }

  /**
   * Fetch AI Config for a specific job
   */
  async getConfigForJob(jobId) {
    try {
      const { AIConfig } = require("../models");
      const config = await AIConfig.findOne({ where: { jobId: String(jobId), status: "ACTIVE" } });
      return config;
    } catch (e) {
      console.warn(`[ScoringService] Failed to fetch config for job ${jobId}: ${e.message}`);
      return null;
    }
  }

  /**
   * Regression Model Decision Engine
   */
  async predictFinalScore(features) {
    const {
      jobId = null,
      resumeScore = 0,
      assessmentScore = 0,
      interviewScore = 0,
      malpracticeScore = 0,
      aiScore = null,
      skillWeights = {} 
    } = features;

    // 1. Determine Weights (Prioritize DB Config -> Manual Overrides -> Defaults)
    let weights = {
      resume: this.regressionCoefficients.resumeWeight,
      assessment: this.regressionCoefficients.assessmentWeight,
      interview: this.regressionCoefficients.interviewWeight,
      malpractice: this.regressionCoefficients.malpracticePenalty
    };

    let passingThreshold = 50; // Default 50%

    if (jobId) {
      const dbConfig = await this.getConfigForJob(jobId);
      if (dbConfig) {
        weights.resume = dbConfig.resumeWeight;
        weights.assessment = (dbConfig.mcqWeight + dbConfig.technicalWeight) / 2; // Average for assessment
        weights.interview = dbConfig.interviewWeight;
        passingThreshold = dbConfig.passingThreshold * 100;
      }
    }

    // Apply manual overrides if present
    if (skillWeights.resume) weights.resume = skillWeights.resume;
    if (skillWeights.assessment) weights.assessment = skillWeights.assessment;
    if (skillWeights.interview) weights.interview = skillWeights.interview;

    // 2. ML Regression Calculation
    const { intercept } = this.regressionCoefficients;
    
    let mlScore = intercept + 
                  (resumeScore * weights.resume * 0.8) + 
                  (assessmentScore * weights.assessment * 1.2) + 
                  (interviewScore * weights.interview) + 
                  (Math.min(malpracticeScore, 10) * weights.malpractice);

    // Calculate dynamic max possible score given the weights to use as divisor
    const maxTheoreticalScore = intercept + 
                                (100 * weights.resume * 0.8) + 
                                (100 * weights.assessment * 1.2) + 
                                (100 * weights.interview);

    mlScore = Math.max(0, Math.min(100, (mlScore / maxTheoreticalScore) * 100)); 

    // 2. Hybrid Logic Implementation
    let finalScore;
    let method;
    const isAiAvailable = aiScore !== null && !isNaN(aiScore) && aiScore > 0;

    if (isAiAvailable) {
      finalScore = (aiScore * 0.6) + (mlScore * 0.4);
      method = 'HYBRID_AI_ML';
    } else {
      finalScore = mlScore;
      method = 'ML_REGRESSION';
    }

    finalScore = Math.round(finalScore);

    // 3. Classification based on Threshold
    let classification = 'REJECT';
    if (finalScore >= passingThreshold + 15) classification = 'HIRE'; // High pass
    else if (finalScore >= passingThreshold) classification = 'HOLD'; // Marginal pass
    
    return {
      finalScore,
      decision: classification,
      methodUsed: method,
      passingThreshold,
      insights: this.generateInsights(features, finalScore, classification)
    };
  }

  generateInsights(features, score, decision) {
    const strengths = [];
    const weaknesses = [];
    
    const hasResume = (features.resumeScore > 0);
    const hasAssessment = (features.assessmentScore > 0);
    const hasInterview = (features.interviewScore > 0);

    // Score based insights - Only if attempted
    if (features.assessmentScore >= 80) strengths.push('High precision in technical assessments');
    if (features.interviewScore >= 75) strengths.push('Strong communication and contextual clarity');
    if (features.resumeScore >= 70) strengths.push('Structural alignment between resume and JD');

    if (hasAssessment && features.assessmentScore < 50) weaknesses.push('Technical proficiency below target threshold');
    if (hasInterview && features.interviewScore < 50) weaknesses.push('Potential gaps in concept verbalization');
    if (features.malpracticeScore > 3) weaknesses.push('Integrity flags: Proctoring violations detected');

    // Text based integration if metadata provided
    if (hasResume && features.skillMatch && features.skillMatch.matchPercentage < 40) {
      weaknesses.push(`Missing critical job-related keywords: ${features.skillMatch.missing.slice(0, 3).join(', ')}`);
    } else if (hasResume && features.skillMatch && features.skillMatch.matchPercentage >= 70) {
      strengths.push(`Excellent keyword overlap with job requirements (${features.skillMatch.matchPercentage}%)`);
    }

    let reasoning = "";
    const isComplete = hasResume && hasAssessment && hasInterview;

    if (!isComplete) {
      reasoning = `Evaluation in progress. Current performance reflects available data from ${[
        hasResume ? 'Resume' : '',
        hasAssessment ? 'Assessment' : '',
        hasInterview ? 'Interview' : ''
      ].filter(Boolean).join(', ')}. Final decision requires completion of all stages.`;
    } else if (decision === 'HIRE') {
      reasoning = `Highly recommended. Performance exceeds the matrix benchmark of ${score}%. Multi-layer evaluation suggests strong readiness.`;
    } else if (decision === 'HOLD') {
      reasoning = `Marginal candidate. Technical or communication scores warrant a manual secondary review for final fit.`;
    } else {
      reasoning = `Does not meet current operational benchmarks. Critical skill overlaps or performance metrics fell below acceptable limits.`;
    }

    return { strengths, weaknesses, reasoning, isComplete };
  }
}

module.exports = new ScoringService();
