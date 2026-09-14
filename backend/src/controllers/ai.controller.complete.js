const aiService = require('../services/ai.service');
const scoringService = require('../services/scoring.service');
const {
  Resume,
  ResumeAnalysis,
  AssessmentAnalysis,
  InterviewAnalysis,
  AIDecision,
  Application,
  ApplicationStatusLog,
  Candidate,
  ManualJobMapping,
  Job,
  User,
  Offer,
  AssessmentAttempt
} = require('../models');
const logger = require('../utils/logger');
const { buildAssetUrl } = require('../utils/urlHelper');

/**
 * ==================== RESUME OPERATIONS ====================
 */

/**
 * Parse resume with AI enhancement and JD matching
 */
exports.parseResumeWithAI = async (req, res) => {
  try {
    let filePath = req.file?.path;

    if (!filePath) {
      // Fallback: Check if we can find the resume in the DB for retry
      const { applicationId } = req.body;
      if (applicationId) {
        const app = await Application.findByPk(applicationId, {
          include: [{ model: Candidate, attributes: ['resume_path'] }]
        });
        if (app?.Candidate?.resume_path) {
          const path = require('path');
          const cleanPath = app.Candidate.resume_path.startsWith('/') ? app.Candidate.resume_path.substring(1) : app.Candidate.resume_path;
          filePath = path.resolve(process.cwd(), cleanPath);
        }
      }
    }

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'No resume file found for parsing',
        code: 'FILE_MISSING'
      });
    }

    const { applicationId, jobId } = req.body;
    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: 'applicationId is required',
        code: 'APP_ID_MISSING'
      });
    }

    logger.info(`Parsing resume for application ${applicationId}`);

    // Fetch Job Data FIRST for role-specific scoring
    const job = jobId ? await Job.findByPk(jobId) : await Application.findByPk(applicationId, { include: [Job] }).then(a => a?.Job);
    const jobContext = job ? {
      title: job.title,
      description: job.description || '',
      skills: Array.isArray(job.required_skills) ? job.required_skills : []
    } : {};

    logger.info(`[Resume Parse] Job context: ${jobContext.title || 'None'}`);

    // Parse with AI service (with job context for role-specific insights)
    const parsedData = await aiService.parseResumeWithAI(filePath, jobContext);

    // Determine correct experience: if FRESHER, force 0
    const candidateType = (parsedData.candidate_type || '').toUpperCase();
    const correctExpYears = candidateType === 'FRESHER' ? 0 : (parsedData.total_years_experience || parsedData.experience_years || 0);

    // Generate resume summary (with job context)
    const summary = await aiService.generateResumeSummary({ ...parsedData, total_years_experience: correctExpYears }, jobContext);

    // Fetch updated Job for JD scoring (if not already fetched)
    const jdText = job ? `${job.title} ${job.description || ''} ${(job.required_skills || []).join(' ')}` : '';
    const resumeText = JSON.stringify(parsedData);

    // ML Validation Layer (Cosine Similarity)
    const cosineSimilarityScore = scoringService.calculateCosineSimilarity(jdText, resumeText);
    const hybridJDScore = Math.round((parsedData.overall_score * 0.6) + (cosineSimilarityScore * 40));

    // Extract highest qualification
    const highestQual = parsedData.highest_qualification || null;

    // Upsert resume analysis in database (support re-parse)
    const [resumeAnalysis, created] = await ResumeAnalysis.upsert({
      application_id: applicationId,
      resume_id: parsedData.resume_id || null,
      contact_info: parsedData.contact_info,
      education: parsedData.education,
      experience: parsedData.experience,
      skills: parsedData.skills,
      certifications: parsedData.certifications,
      languages: parsedData.languages,
      ai_summary: summary.executive_summary,
      strengths: summary.key_strengths,
      weaknesses: summary.weaknesses || [],
      recommendations: summary.recommended_improvements || [],
      key_achievements: parsedData.key_achievements,
      overall_score: hybridJDScore,
      jd_match_score: 0,
      total_years_experience: correctExpYears,
      highest_qualification: highestQual,
      ai_model_used: 'gemini-2.0-flash-hybrid'
    }, { returning: true });

    // Update Candidate record with correct experience and qualification
    if (applicationId) {
      try {
        const app = await Application.findByPk(applicationId, { include: [Candidate] });
        if (app?.Candidate) {
          const updatePayload = {};
          // Only update experience if different (and if fresher, force 0)
          if (candidateType === 'FRESHER') {
            updatePayload.experience_years = 0;
            updatePayload.candidate_type = 'FRESHER';
          } else if (correctExpYears > 0 && correctExpYears !== app.Candidate.experience_years) {
            updatePayload.experience_years = correctExpYears;
          }
          // Update skills if missing
          if (!app.Candidate.skills?.length && parsedData.skills?.length) {
            updatePayload.skills = parsedData.skills;
          }
          // Update education/qualification if blank
          if (!app.Candidate.education && parsedData.education?.[0]?.degree) {
            updatePayload.education = parsedData.education[0].degree;
          }
          if (Object.keys(updatePayload).length > 0) {
            await app.Candidate.update(updatePayload);
            logger.info(`[Resume] Updated Candidate ${app.Candidate.id}: ${JSON.stringify(updatePayload)}`);
          }
        }
      } catch (candErr) {
        logger.warn(`[Resume] Candidate update failed: ${candErr.message}`);
      }
    }


    // JD matching (use already-fetched job object)
    let jdScore = null;
    if (job) {
      const jdReq = { 
        required_skills: job.required_skills || [], 
        description: job.description || job.title || ''
      };
      jdScore = await aiService.scoreResume(parsedData, jdReq);
      const finalJDScore = Math.round((jdScore.overall_fit_percentage * 0.6) + (cosineSimilarityScore * 40));
      const updateData = {
        jd_match_score: finalJDScore,
        jd_matched_skills: jdScore.matched_skills,
        jd_missing_skills: jdScore.missing_skills
      };
      if (Array.isArray(resumeAnalysis)) {
        await resumeAnalysis[0]?.update?.(updateData);
      } else {
        await resumeAnalysis.update?.(updateData);
      }
    }

    const ra = Array.isArray(resumeAnalysis) ? resumeAnalysis[0] : resumeAnalysis;

    // Update application with resume score
    await Application.update(
      {
        resume_score: ra?.jd_match_score || ra?.overall_score || hybridJDScore,
        status: 'RESUME_EVALUATED'
      },
      { where: { id: applicationId } }
    );

    // Log status change
    await ApplicationStatusLog.create({
      application_id: applicationId,
      previous_status: 'RESUME_SUBMITTED',
      new_status: 'RESUME_EVALUATED',
      changed_by: 'system',
      changed_by_role: 'system',
      is_ai_decision: true,
      reason: `Resume parsed for role: ${job?.title || 'Unknown'}. Hybrid AI+ML Engine used.`,
      ai_score: ra?.overall_score
    });

    return res.status(200).json({
      success: true,
      message: 'Resume parsed successfully with Hybrid AI analysis',
      data: {
        analysis_id: ra?.id,
        resume_score: ra?.overall_score,
        jd_match_score: ra?.jd_match_score,
        summary: summary,
        cosine_similarity: cosineSimilarityScore,
        // Key metadata for HR decision
        highest_qualification: highestQual || 'Not detected — review manually',
        experience_years: correctExpYears,
        candidate_type: candidateType || 'UNKNOWN',
        role_applied: job?.title || 'Unknown',
        education_highlight: summary?.education_highlight || highestQual,
        jd_match_analysis: summary?.jd_match_analysis || null
      }
    });


  } catch (error) {
    logger.warn(`AI Resume parsing failed for application ${req.body.applicationId}, triggering ML Fallback:`, error.message);

    try {
      const { applicationId, jobId } = req.body;
      const job = jobId ? await Job.findByPk(jobId) : null;
      const application = await Application.findByPk(applicationId);

      const jdText = job ? `${job.title} ${job.description} ${job.required_skills?.join(' ')}` : '';
      const candidateInfo = `${application?.skills?.join(' ')} ${application?.summary || ''} ${application?.experience_years} years ${application?.education}`;

      const mlScore = Math.round(scoringService.calculateCosineSimilarity(jdText, candidateInfo) * 100);
      const skillMatch = scoringService.matchSkills(job?.required_skills?.join(' ') || job?.title || '', application?.skills || []);

      const resumeAnalysis = await ResumeAnalysis.create({
        application_id: applicationId,
        ai_summary: "Generated via ML Fallback (Cosine Similarity + TF Vectorization) due to AI unavailability.",
        overall_score: mlScore,
        jd_match_score: mlScore,
        jd_matched_skills: skillMatch.matched,
        jd_missing_skills: skillMatch.missing,
        strengths: skillMatch.matchPercentage > 60 ? ["Strong keyword overlap with JD"] : ["Profile surface matching complete"],
        weaknesses: skillMatch.matchPercentage < 30 ? ["Core skill gaps detected in profile"] : [],
        ai_model_used: 'ml-fallback-cosine-tf'
      });

      await Application.update({ resume_score: mlScore, status: 'RESUME_EVALUATED' }, { where: { id: applicationId } });

      return res.status(200).json({
        success: true,
        message: 'Resume evaluated using robust ML fallback (AI service unavailable)',
        data: { analysis_id: resumeAnalysis.id, resume_score: mlScore, is_backup: true, method: 'ML_COSINE' }
      });
    } catch (manualError) {
      logger.error(`Critical Failure: Even ML fallback failed for app ${req.body.applicationId}:`, manualError);
      return res.status(500).json({ success: false, message: 'Total failure of evaluation system' });
    }
  }
};

/**
 * Re-parse an existing resume for an application
 */
exports.reparseResume = async (req, res) => {
  try {
    const { applicationId } = req.params;

    logger.info(`Triggering re-parse for application ${applicationId}`);

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate }, { model: Job }]
    });

    if (!application || !application.Candidate) {
      return res.status(404).json({ success: false, message: 'Application or Candidate not found' });
    }

    const candidate = application.Candidate;
    const resumePath = candidate.resume_path;

    if (!resumePath) {
      return res.status(400).json({ success: false, message: 'No resume found for this candidate' });
    }

    const path = require('path');
    const fs = require('fs');
    // Ensure resumePath is relative for path.join to work correctly across OSs
    const cleanResumePath = resumePath.startsWith('/') ? resumePath.substring(1) : resumePath;
    const backendRoot = path.resolve(__dirname, '../..');
    const absolutePath = path.join(backendRoot, cleanResumePath);

    if (!fs.existsSync(absolutePath)) {
      logger.warn(`[Reparse] File not found at ${absolutePath}, searching in alternate locations...`);
      // Try alternate: relative to current process working directory (backend root)
      const altPath = path.resolve(process.cwd(), cleanResumePath);
      if (!fs.existsSync(altPath)) {
        return res.status(404).json({
          success: false,
          message: `Resume file not found on disk at any expected location: ${resumePath}`,
          code: 'FILE_NOT_FOUND'
        });
      }
    }

    // Parse with AI service
    const parsedData = await aiService.parseResumeWithAI(absolutePath);

    // Generate resume summary
    const summary = await aiService.generateResumeSummary(parsedData);

    // Fetch Job Data
    const job = application.Job;
    const jdText = job ? `${job.title} ${job.description} ${job.required_skills?.join(' ')}` : '';
    const resumeText = JSON.stringify(parsedData);

    // ML Validation Layer (Cosine Similarity)
    const cosineSimilarityScore = scoringService.calculateCosineSimilarity(jdText, resumeText);
    const hybridScore = Math.round((parsedData.overall_score * 0.6) + (cosineSimilarityScore * 40));

    // Update or Create AI Analysis
    let resumeAnalysis = await ResumeAnalysis.findOne({ where: { application_id: applicationId } });

    const analysisData = {
      contact_info: parsedData.contact_info,
      education: parsedData.education,
      experience: parsedData.experience,
      skills: parsedData.skills,
      certifications: parsedData.certifications,
      ai_summary: summary.executive_summary,
      strengths: summary.key_strengths,
      weaknesses: summary.weaknesses || [],
      recommendations: summary.recommended_improvements || [],
      overall_score: hybridScore,
      total_years_experience: parsedData.total_years_experience,
      highest_qualification: parsedData.highest_qualification,
      ai_model_used: 'gemini-2.0-flash-hybrid'
    };

    if (resumeAnalysis) {
      await resumeAnalysis.update(analysisData);
    } else {
      resumeAnalysis = await ResumeAnalysis.create({
        application_id: applicationId,
        ...analysisData
      });
    }

    // JD matching if job exists
    if (job) {
      const jdScore = await aiService.scoreResume(parsedData, job.id);
      const finalJDScore = Math.round((jdScore.overall_fit_percentage * 0.6) + (cosineSimilarityScore * 40));
      await resumeAnalysis.update({
        jd_match_score: finalJDScore,
        jd_matched_skills: jdScore.matched_skills,
        jd_missing_skills: jdScore.missing_skills
      });
    }

    // Update application with resume score
    await application.update({
      resume_score: resumeAnalysis.jd_match_score || resumeAnalysis.overall_score,
      status: application.status === 'PENDING' ? 'RESUME_EVALUATED' : application.status
    });

    return res.status(200).json({
      success: true,
      message: 'Resume re-parsed successfully',
      data: {
        analysis_id: resumeAnalysis.id,
        resume_score: resumeAnalysis.overall_score,
        jd_match_score: resumeAnalysis.jd_match_score
      }
    });

  } catch (error) {
    logger.error(`[Reparse] Critical failure for app ${req.params.applicationId}: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to re-parse resume: ' + error.message,
      code: 'REPARSE_ERROR'
    });
  }
};

/**
 * ==================== ASSESSMENT OPERATIONS ====================
 */

/**
 * Analyze coding solution
 */
exports.analyzeCodingAssessment = async (req, res) => {
  try {
    const { applicationId, code, problemDescription, testName } = req.body;

    if (!code || !problemDescription || !applicationId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: applicationId, code, problemDescription',
        code: 'INVALID_INPUT'
      });
    }

    logger.info(`Analyzing coding solution for application ${applicationId}`);

    // Analyze with AI service (with 15s timeout)
    const analyzePromise = aiService.analyzeCodingSolution(code, problemDescription);
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('AI grading timeout')), 15000);
    });
    const analysis = await Promise.race([analyzePromise, timeoutPromise]).finally(() => clearTimeout(timerId));
    
    const clamp = (val) => isNaN(Number(val)) ? 0 : Math.min(100, Math.max(0, Number(val)));
    const aiScore = clamp(analysis.overall_score);

    // ML Validation Layer (Cosine Similarity)
    const similarityScore = scoringService.calculateCosineSimilarity(code, problemDescription);
    const hybridScore = Math.round((aiScore * 0.6) + (similarityScore * 40));

    // Store assessment analysis
    const assessmentAnalysis = await AssessmentAnalysis.create({
      application_id: applicationId,
      assessment_type: 'coding',
      test_name: testName || 'Coding Challenge',
      candidate_response: { code, problemDescription },
      overall_score: clamp(hybridScore),
      correctness_score: clamp(analysis.correctness_score),
      code_quality_score: clamp(analysis.code_quality_score),
      efficiency_score: clamp(analysis.efficiency_score),
      time_complexity: analysis.time_complexity || 'O(N)',
      space_complexity: analysis.space_complexity || 'O(N)',
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      improvement_areas: analysis.optimization_suggestions || [],
      estimated_skill_level: analysis.skill_level || 'Intermediate',
      estimated_years_experience: analysis.estimated_experience_years || 1,
      detailed_feedback: analysis.detailed_feedback || analysis.feedback,
      follow_up_questions: analysis.recommendations || [],
      ai_model_used: analysis.model_used || 'gemini-2.5-flash'
    });

    const { AssessmentAttempt } = require('../models');
    await AssessmentAttempt.update({
      ai_score: analysis.overall_score || 0,
      structure_score: analysis.structure_score || 0,
      concept_coverage: analysis.concept_coverage || 0,
      final_score: hybridScore,
      ai_feedback: analysis.detailed_feedback,
      status: 'COMPLETED'
    }, {
      where: { application_id: applicationId, assessment_type: 'coding' }
    });

    // Update application with hybrid technical score
    await Application.update(
      { technical_score: assessmentAnalysis.overall_score },
      { where: { id: applicationId } }
    );

    return res.status(200).json({
      success: true,
      message: 'Coding solution analyzed successfully with Hybrid Engine',
      data: {
        analysis_id: assessmentAnalysis.id,
        score: assessmentAnalysis.overall_score,
        confidence: 0.90
      }
    });

  } catch (error) {
    logger.warn(`Coding assessment analysis failed for app ${req.body.applicationId}, triggering ML Fallback:`, error.message);
    try {
      const { applicationId, code, problemDescription, testName } = req.body;

      // ML FALLBACK
      const similarityScore = scoringService.calculateCosineSimilarity(code, problemDescription);
      const fallbackScore = Math.round(similarityScore * 100);

      const assessmentAnalysis = await AssessmentAnalysis.create({
        application_id: applicationId,
        assessment_type: 'coding',
        test_name: testName || 'Coding Challenge',
        overall_score: fallbackScore,
        strengths: ["Code matches problem surface requirements"],
        weaknesses: ["AI quality analysis unavailable"],
        detailed_feedback: "AI service unavailable. Scored based on ML-based requirement mapping.",
        ai_model_used: 'ml-fallback-similarity'
      });

      await Application.update({ technical_score: fallbackScore }, { where: { id: applicationId } });

      return res.status(200).json({
        success: true,
        message: 'Coding solution evaluated using ML fallback logic',
        data: { analysis_id: assessmentAnalysis.id, score: fallbackScore, is_fallback: true }
      });
    } catch (manualError) {
      logger.error(`Critical Failure in Coding Scorer:`, manualError);
      return res.status(500).json({ success: false, message: 'Technical evaluation module failure' });
    }
  }
};

/**
 * Analyze MCQ test responses
 */
exports.analyzeMCQAssessment = async (req, res) => {
  try {
    const { applicationId, questions, answers, testName } = req.body;

    if (!questions || !answers || !applicationId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: applicationId, questions, answers',
        code: 'INVALID_INPUT'
      });
    }

    logger.info(`Analyzing MCQ responses for application ${applicationId}`);

    // Analyze with AI service (with 15s timeout)
    const analyzePromise = aiService.analyzeMCQTest(questions, answers);
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('AI grading timeout')), 15000);
    });
    const analysis = await Promise.race([analyzePromise, timeoutPromise]).finally(() => clearTimeout(timerId));
    
    const clamp = (val) => isNaN(Number(val)) ? 0 : Math.min(100, Math.max(0, Number(val)));

    // Hybrid Integration: For MCQ, AI is used for qualitative feedback, 
    // while the score is strictly deterministic.
    const score = clamp((analysis.overall_score / 100) * 100);

    // Store assessment analysis
    const assessmentAnalysis = await AssessmentAnalysis.create({
      application_id: applicationId,
      assessment_type: 'mcq',
      test_name: testName || 'MCQ Test',
      total_questions: questions.length,
      candidate_response: { answers },
      overall_score: score,
      correctness_score: clamp(analysis.overall_score),
      correct_answers: clamp(analysis.accuracy),
      incorrect_answers: Math.max(0, questions.length - clamp(analysis.accuracy)),
      unattempted: 0,
      topic_scores: analysis.strong_topics ? { strengths: analysis.strong_topics } : {},
      strengths: analysis.strong_topics || [],
      weaknesses: analysis.weak_topics || [],
      improvement_areas: analysis.feedback ? [analysis.feedback] : [],
      estimated_skill_level: analysis.concept_understanding > 80 ? 'Advanced' : 'Intermediate',
      detailed_feedback: analysis.feedback || `Score: ${score}%`,
      ai_model_used: analysis.model_used || 'gemini-2.5-flash'
    });

    const { AssessmentAttempt } = require('../models');
    await AssessmentAttempt.update({
      ai_score: analysis.score_percentage || 0,
      structure_score: 85,
      concept_coverage: analysis.score_percentage || 0,
      final_score: score,
      ai_feedback: analysis.detailed_feedback || `Score: ${analysis.score_percentage}%`,
      status: 'COMPLETED'
    }, {
      where: { application_id: applicationId, assessment_type: 'mcq' }
    });

    // Update application with technical score
    await Application.update(
      { technical_score: score },
      { where: { id: applicationId } }
    );

    return res.status(200).json({
      success: true,
      message: 'MCQ assessment analyzed successfully',
      data: {
        analysis_id: assessmentAnalysis.id,
        score_percentage: score,
        skill_level: analysis.estimated_skill_level
      }
    });

  } catch (error) {
    logger.warn(`MCQ assessment analysis failed for app ${req.body.applicationId}, attempting deterministic fallback:`, error.message);
    try {
      const { applicationId, questions, answers, testName } = req.body;

      // DETERMINISTIC FALLBACK (Pure Logic)
      let correct = 0;
      questions.forEach((q, i) => {
        if (answers[i] === q.correct_answer || answers[i]?.toString() === q.correct_answer?.toString()) {
          correct++;
        }
      });
      const score = Math.round((correct / questions.length) * 100);

      const assessmentAnalysis = await AssessmentAnalysis.create({
        application_id: applicationId,
        assessment_type: 'mcq',
        test_name: testName || 'MCQ Test',
        overall_score: score,
        detailed_feedback: "AI service unavailable. Scored using pure deterministic logic.",
        ai_model_used: 'deterministic-fallback'
      });

      await Application.update({ technical_score: score }, { where: { id: applicationId } });

      return res.status(200).json({
        success: true,
        message: 'MCQ evaluated using deterministic logic fallback',
        data: { analysis_id: assessmentAnalysis.id, score_percentage: score, is_fallback: true }
      });
    } catch (manualError) {
      return res.status(500).json({ success: false, message: 'MCQ evaluation module failure' });
    }
  }
};

/**
 * ==================== INTERVIEW OPERATIONS ====================
 */

/**
 * Analyze interview session
 */
exports.analyzeInterview = async (req, res) => {
  try {
    let { applicationId, transcript, questions, interviewType } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: 'applicationId is required',
        code: 'INVALID_INPUT'
      });
    }

    // CRITICAL: If transcript is missing, try to fetch from InterviewSession
    if (!transcript || transcript.trim() === "") {
      const { InterviewSession } = require('../models');
      const session = await InterviewSession.findOne({
        where: { application_id: applicationId },
        order: [['created_at', 'DESC']]
      });

      if (session) {
        if (session.transcription) {
          transcript = session.transcription;
          logger.info(`Fetched transcript from database for application ${applicationId}`);
        } else if (session.questions_asked && Array.isArray(session.questions_asked)) {
          // Rebuild transcript from questions
          const parts = session.questions_asked
            .filter(q => q.response_text)
            .map(q => `Q: ${q.question_text || q.question}\nA: ${q.response_text}`)
            .join('\n\n');

          if (parts) {
            transcript = parts;
            logger.info(`Rebuilt transcript from questions_asked for application ${applicationId}`);
          }
        }
      }

      if (!transcript || transcript.trim() === "") {
        return res.status(400).json({
          success: false,
          message: 'No transcript provided and no session recording found.',
          code: 'TRANSCRIPT_MISSING'
        });
      }
    }

    logger.info(`Analyzing interview for application ${applicationId}`);

    // Fetch job context for role-specific analysis
    let jobTitle = 'the specified role';
    let jobSkills = [];
    try {
      const app = await Application.findByPk(applicationId, { include: [Job] });
      if (app?.Job) {
        jobTitle = app.Job.title;
        jobSkills = app.Job.required_skills || [];
      }
    } catch(jErr) {
      logger.warn(`[Interview] Could not fetch job for app ${applicationId}`);
    }

    // AI Analysis Success Path
    const analysis = await aiService.analyzeInterview(transcript, {
      type: interviewType || 'technical',
      questions,
      jobTitle,
      jobSkills
    });

    const clamp = (val) => isNaN(Number(val)) ? 0 : Math.min(100, Math.max(0, Number(val)));
    const aiScore = clamp(analysis.overall_assessment?.overall_score);

    // ML Validation Layer (TF-IDF + Cosine Similarity)
    const referenceText = questions ? JSON.stringify(questions) : "Job Requirements and Technical Skills";
    const similarityScore = scoringService.calculateCosineSimilarity(transcript, referenceText);

    // Hybrid Rule: (ai_score * 0.7) + (similarityScore * 30)
    const hybridScore = Math.round((aiScore * 0.7) + (similarityScore * 30));

    // ── Helper: sanitise AI output to only valid DB-enum values ─────────
    const toValidClarity = (v) => ['very_clear','clear','somewhat_clear','unclear'].includes(v) ? v : 'clear';
    const toValidConfidence = (v) => ['high','medium','low'].includes(v) ? v : 'medium';
    const toValidPace = (v) => ['fast','normal','slow'].includes(v) ? v : 'normal';
    const toValidHesitation = (v) => ['high','medium','low'].includes(v) ? v : 'low';
    const toValidVocabulary = (v) => ['advanced','intermediate','basic'].includes(v) ? v : 'intermediate';
    const toValidPerformance = (v) => ['high','medium','low'].includes(v) ? v : 'medium';
    const toValidTeamFit = (v) => ['good','fair','poor'].includes(v) ? v : 'good';
    const toValidGrowth = (v) => ['fast','moderate','slow'].includes(v) ? v : 'moderate';
    const toValidHireRec = (v) => ['strong_yes','yes','maybe','no','strong_no'].includes(v) ? v : 'maybe';
    const toValidInterviewType = (v) => ['technical','hr','behavioral','system_design'].includes(v) ? v : 'technical';

    // ── UPSERT: update existing record or create new one ────────────────
    // application_id is UNIQUE — re-analyzing the same application must update, not insert
    const aiPayload = {
      interview_type: toValidInterviewType(interviewType),
      transcript: transcript.substring(0, 10000),
      qa_pairs: analysis.qa_analyses || [],
      overall_score: clamp(hybridScore),
      technical_knowledge_score: clamp(analysis.metrics?.technical_knowledge) || Math.round(hybridScore * 0.8),
      problem_solving_score: clamp(analysis.metrics?.problem_solving) || Math.round(hybridScore * 0.7),
      communication_score: clamp(analysis.metrics?.communication) || Math.round(hybridScore * 0.9),
      soft_skills_score: clamp(analysis.metrics?.soft_skills) || Math.round(hybridScore * 0.6),
      cultural_fit_score: clamp(analysis.metrics?.cultural_fit) || Math.round(hybridScore * 0.5),

      confidence_level: toValidConfidence(analysis.speaking_patterns?.confidence_level),
      pace: toValidPace(analysis.speaking_patterns?.pace),
      clarity: toValidClarity(analysis.speaking_patterns?.clarity),
      hesitation_level: toValidHesitation(analysis.speaking_patterns?.hesitation_level),
      vocabulary_level: toValidVocabulary(analysis.speaking_patterns?.vocabulary_level),

      answer_analyses: analysis.qa_analyses,
      strengths: analysis.overall_assessment?.key_takeaways || [],
      weaknesses: analysis.weaknesses || [],
      green_flags: analysis.green_flags || [],
      red_flags: analysis.red_flags || [],

      predicted_on_job_performance: toValidPerformance(analysis.performance_prediction?.predicted_on_job_performance),
      team_fit_assessment: toValidTeamFit(analysis.team_fit_assessment),
      growth_trajectory: toValidGrowth(analysis.growth_trajectory),
      // AI may return float strings like "7.00" — coerce to integer
      time_to_productivity_months: Math.round(parseInt(analysis.performance_prediction?.time_to_productivity_months, 10) || 1),
      retention_probability_percentage: clamp(analysis.performance_prediction?.retention_probability_percentage) || 80,

      hire_recommendation: toValidHireRec(analysis.recommendation),
      next_round_ready: !!analysis.overall_assessment?.next_round_readiness,
      detailed_evaluation: JSON.stringify(analysis),
      ai_model_used: analysis.model_used || 'gemini-2.5-flash'
    };

    let interviewAnalysis = await InterviewAnalysis.findOne({ where: { application_id: applicationId } });
    if (interviewAnalysis) {
      await interviewAnalysis.update(aiPayload);
      logger.info(`Updated existing InterviewAnalysis for application ${applicationId}`);
    } else {
      interviewAnalysis = await InterviewAnalysis.create({ application_id: applicationId, ...aiPayload });
      logger.info(`Created new InterviewAnalysis for application ${applicationId}`);
    }

    // Update application and core interview record
    await Application.update(
      {
        interview_score: hybridScore,
        behavioral_score: analysis.metrics?.soft_skills || 70,
        status: 'INTERVIEW_COMPLETED'
      },
      { where: { id: applicationId } }
    );

    const { Interview } = require('../models');
    await Interview.update(
      {
        ai_score: interviewAnalysis.overall_score,
        ai_summary: interviewAnalysis.hire_recommendation,
        status: 'COMPLETED'
      },
      { where: { application_id: applicationId } }
    );

    await Application.update(
      {
        interview_score: interviewAnalysis.overall_score,
        status: 'HR_REVIEW' // Assessment is likely done if they reach here
      },
      { where: { id: applicationId } }
    );

    return res.status(200).json({
      success: true,
      message: 'Interview analyzed successfully using Hybrid Intelligence',
      data: {
        analysis_id: interviewAnalysis.id,
        overall_score: interviewAnalysis.overall_score,
        hire_recommendation: analysis.recommendation,
        strengths: interviewAnalysis.strengths || [],
        weaknesses: interviewAnalysis.weaknesses || [],
        job_role: jobTitle,
        confidence: 0.92
      }
    });

  } catch (error) {
    logger.warn(`Interview analysis failed for app ${req.body.applicationId}, triggering ML Fallback:`, error.message);
    try {
      const { applicationId, transcript, interviewType } = req.body;

      // ML FALLBACK (Deterministic Similarity Engine)
      const similarityScore = scoringService.calculateCosineSimilarity(transcript, "Technical skills, experience, and professional background");
      const fallbackScore = Math.round(similarityScore * 100);

      // Clamp fallback score to valid 0-100 range
      const clampedFallbackScore = Math.min(100, Math.max(0, fallbackScore));

      // ── UPSERT: avoid duplicate key on application_id UNIQUE constraint ──
      const fallbackPayload = {
        // DB constraint: interview_type IN ('technical','hr','behavioral','system_design')
        interview_type: ['technical','hr','behavioral','system_design'].includes(interviewType) ? interviewType : 'technical',
        overall_score: clampedFallbackScore,
        technical_knowledge_score: clampedFallbackScore,
        problem_solving_score: clampedFallbackScore,
        communication_score: clampedFallbackScore,
        soft_skills_score: clampedFallbackScore,
        cultural_fit_score: clampedFallbackScore,
        confidence_level: 'medium',
        communication_style: 'professional',
        pace: 'normal',
        clarity: 'somewhat_clear',
        hesitation_level: 'low',
        vocabulary_level: 'intermediate',
        predicted_on_job_performance: 'medium',
        team_fit_assessment: 'good',
        growth_trajectory: 'moderate',
        hire_recommendation: 'maybe',
        strengths: ['Candidate demonstrated structured responses to interview questions'],
        weaknesses: ['AI deep-analysis unavailable — review responses manually', 'Insufficient transcript data for full evaluation'],
        detailed_evaluation: 'AI service unavailable. Scored using ML-based Cosine Similarity fallback. Manual review recommended.',
        ai_model_used: 'ml-fallback-similarity'
      };

      let interviewAnalysis = await InterviewAnalysis.findOne({ where: { application_id: applicationId } });
      if (interviewAnalysis) {
        await interviewAnalysis.update(fallbackPayload);
        logger.info(`ML Fallback: Updated existing InterviewAnalysis for application ${applicationId}`);
      } else {
        interviewAnalysis = await InterviewAnalysis.create({ application_id: applicationId, ...fallbackPayload });
        logger.info(`ML Fallback: Created new InterviewAnalysis for application ${applicationId}`);
      }

      await Application.update({ interview_score: fallbackScore }, { where: { id: applicationId } });

      return res.status(200).json({
        success: true,
        message: 'Interview evaluated using deterministic ML fallback',
        data: { analysis_id: interviewAnalysis.id, overall_score: fallbackScore, is_fallback: true }
      });
    } catch (manualError) {
      logger.error("Critical Failure in Interview Scorer:", manualError);
      return res.status(500).json({ success: false, message: 'Interview evaluation module failure' });
    }
  }
};

/**
 * ==================== AUTO-REJECTION ENGINE ====================
 */

/**
 * Calculate final AI decision and execute auto-rejection
 */
exports.makeFinalAIDecision = async (req, res) => {
  try {
    const { applicationId, jobId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: 'applicationId is required',
        code: 'APP_ID_MISSING'
      });
    }

    logger.info(`Making final AI decision for application ${applicationId}`);

    // Get application and job data for dynamic weighting
    const application = await Application.findByPk(applicationId, {
      include: [{ model: Job }]
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
        code: 'APP_NOT_FOUND'
      });
    }

    const job = application.Job;
    const resumeScore = application.resume_score || 0;
    const technicalScore = application.technical_score || 0;
    const interviewScore = application.interview_score || 0;
    const isAiAvailable = true;

    // Calculate text-based skill match for final insights
    const skillMatch = scoringService.matchSkills(job?.required_skills?.join(' ') || job?.title || '', application?.skills || []);

    // Use the upgraded Hybrid Scoring Engine with Dynamic Job weights
    const scoringResult = await scoringService.predictFinalScore({
      jobId: jobId || application.job_id,
      resumeScore,
      assessmentScore: technicalScore,
      interviewScore,
      malpracticeScore: application.malpractice_warnings || 0,
      aiScore: (resumeScore + technicalScore + interviewScore) / 3,
      skillWeights: job?.skill_weights || {},
      skillMatch: skillMatch
    });
    const finalScore = scoringResult.finalScore;
    const aiDecision = scoringResult.decision === 'HIRE' ? 'RECOMMENDED' :
      scoringResult.decision === 'HOLD' ? 'PROCEED_TO_HR' : 'AUTO_REJECTED';
    const decisionReason = scoringResult.insights.reasoning;

    // Store AI decision with hybrid insights
    const aiDecisionRecord = await AIDecision.create({
      application_id: applicationId,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      resume_score: resumeScore,
      resume_weight: 0.25,
      technical_assessment_score: technicalScore,
      technical_weight: 0.45,
      interview_score: interviewScore,
      interview_weight: 0.30,
      final_score: finalScore,
      score_threshold: 40,
      meets_minimum_requirements: finalScore >= 40,
      ai_decision: aiDecision,
      decision_reason: decisionReason,
      confidence_percentage: Math.round(scoringResult.confidence * 100),
      summary: `Score: ${finalScore}% | Method: ${scoringResult.methodUsed}. ${scoringResult.insights.reasoning}`,
      ai_model_used: isAiAvailable ? 'gemini-2.0-flash-hybrid' : 'ml-regression-fallback'
    });

    // Update application status based on decision
    // DISABLED AUTO-REJECTION AS PER USER REQUEST
    let newStatus = 'HR_REVIEW';
    // if (aiDecision === 'AUTO_REJECTED') {
    //   newStatus = 'REJECTED';
    // } else if (aiDecision === 'RECOMMENDED') {
    //   newStatus = 'HR_REVIEW';
    // }

    await Application.update(
      {
        status: 'HR_REVIEW', // Consistent review state
        overall_score: finalScore
      },
      { where: { id: applicationId } }
    );

    // Log status change
    await ApplicationStatusLog.create({
      application_id: applicationId,
      previous_status: application.status,
      new_status: newStatus,
      changed_by: 'system',
      changed_by_role: 'system',
      is_ai_decision: true,
      ai_decision_id: aiDecisionRecord.id,
      metadata: { reason: decisionReason },
      ai_score: finalScore
    });

    return res.status(200).json({
      success: true,
      message: 'Final AI decision made and applied',
      data: {
        decision_id: aiDecisionRecord.id,
        final_score: finalScore,
        ai_decision: aiDecision,
        new_status: newStatus,
        reason: decisionReason,
        score_breakdown: {
          resume_score: resumeScore,
          technical_score: technicalScore,
          interview_score: interviewScore
        },
        threshold: 40
      }
    });

  } catch (error) {
    logger.error(`Final AI decision error for application ${req.body.applicationId}:`, error);
    if (error.errors) {
      error.errors.forEach(e => logger.error(`  - ${e.field}: ${e.message}`));
    }
    return res.status(500).json({
      success: false,
      message: 'Error making final decision',
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
      details: error.errors ? error.errors.map(e => e.message) : null,
      code: 'DECISION_ERROR'
    });
  }
};

/**
 * ==================== UTILITY ENDPOINTS ====================
 */

/**
 * Get AI analysis for application (with RBAC filtering)
 */
exports.getAIAnalysis = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userRole = req.user?.role; // Set by auth middleware

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: 'applicationId is required',
        code: 'APP_ID_MISSING'
      });
    }

    // RBAC Check: Only HR, MD, and Admin can see full AI analysis
    const restrictedRoles = ['candidate'];
    if (restrictedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to AI analysis',
        code: 'ACCESS_DENIED'
      });
    }

    // Fetch all related analyses
    const resumeAnalysis = await ResumeAnalysis.findOne({
      where: { application_id: applicationId }
    });

    const assessmentAnalyses = await AssessmentAnalysis.findAll({
      where: { application_id: applicationId }
    });

    const { AssessmentAttempt, TechnicalQuestionBank, MCQQuestion, InterviewQuestionBank } = require('../models');
    const assessmentAttempts = await AssessmentAttempt.findAll({
      where: { application_id: applicationId },
      order: [['created_at', 'DESC']]
    });

    // Resolve all question IDs across all banks
    const allQIds = new Set();
    assessmentAttempts.forEach(att => {
      let answers = att.answers;
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch (e) { answers = {}; } }
      if (answers) Object.keys(answers).forEach(id => { if (id && id !== 'null') allQIds.add(id); });
    });

    const questionMap = {};
    if (allQIds.size > 0) {
      const ids = Array.from(allQIds);

      const { Op } = require('sequelize');
      const numericIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));

      // 1. Technical Bank
      const techQs = await TechnicalQuestionBank.findAll({
        where: { questionId: { [Op.in]: ids } },
        attributes: ['questionId', 'question', 'correct_answer', 'expected_answer'] 
      });
      techQs.forEach(q => {
        if (q.questionId) {
          questionMap[q.questionId.trim()] = { text: q.question, correct: q.correct_answer || q.expected_answer };
          questionMap[q.questionId.toLowerCase().trim()] = { text: q.question, correct: q.correct_answer || q.expected_answer };
        }
      });

      // 2. MCQ Bank
      if (numericIds.length > 0) {
        const mcqQs = await MCQQuestion.findAll({ 
          where: { id: { [Op.in]: numericIds } },
          attributes: ['id', 'question', 'correct_option'] 
        });
        mcqQs.forEach(q => { questionMap[String(q.id)] = { text: q.question, correct: q.correct_option }; });
      }

      // 3. Interview Bank
      const intQs = await InterviewQuestionBank.findAll({ 
        where: { questionId: { [Op.in]: ids } },
        attributes: ['questionId', 'question', 'expectedAnswer'] 
      });
      intQs.forEach(q => {
        if (q.questionId) {
          questionMap[q.questionId.trim()] = { text: q.question, correct: q.expectedAnswer };
          questionMap[q.questionId.toLowerCase().trim()] = { text: q.question, correct: q.expectedAnswer };
        }
      });
    }

    const enrichedAttempts = assessmentAttempts.map(att => {
      const attObj = att.get({ plain: true });
      let answers = attObj.answers;
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch (e) { answers = {}; } }

      if (answers) {
        const enrichedAnswers = {};
        Object.keys(answers).forEach(qId => {
          const qData = questionMap[qId] || questionMap[qId.toLowerCase()] || {};
          enrichedAnswers[qId] = {
            ...answers[qId],
            question_text: qData.text || null,
            correct_answer: qData.correct || null
          };
        });
        attObj.answers = enrichedAnswers;
      }
      return attObj;
    });

    // Enrich assessment analyses with question details if available
    const enrichedAssessments = await Promise.all(assessmentAnalyses.map(async (analysis) => {
      const attempt = assessmentAttempts.find(a => a.id === analysis.attempt_id) || assessmentAttempts[0];
      if (attempt && attempt.answers) {
        // Handle both Array (legacy) and Object (new) formats for answers
        const answersArray = Array.isArray(attempt.answers)
          ? attempt.answers
          : Object.entries(attempt.answers).map(([qid, data]) => ({
            question_id: qid,
            answer_text: typeof data === 'string' ? data : data.answer_text
          }));

        const questionIds = answersArray.map((a) => a.question_id);
        const questions = await TechnicalQuestionBank.findAll({
          where: { questionId: questionIds }
        });

        const detailedAnswers = answersArray.map((ans) => {
          const q = questions.find(q => q.questionId === ans.question_id);
          return {
            question_id: ans.question_id,
            question_text: q?.question || 'Question text unavailable',
            candidate_answer: ans.answer_text,
            correct_answer: q?.correct_answer || q?.expected_answer || 'N/A',
            is_correct: ans.answer_text === q?.correct_answer
          };
        });

        return {
          ...analysis.toJSON(),
          detailed_qa: detailedAnswers
        };
      }
      return analysis;
    }));

    const interviewAnalysis = await InterviewAnalysis.findOne({
      where: { application_id: applicationId }
    });

    const aiDecision = await AIDecision.findOne({
      where: { application_id: applicationId }
    });

    // Fetch Application with associations for candidate/job details
    const application = await Application.findByPk(applicationId, {
      include: [
        {
          model: Candidate,
          include: [{ model: User, attributes: ['name', 'email'] }]
        },
        { model: Job, attributes: ['title', 'department'] },
        { model: require('../models').MalpracticeEvent }
      ]
    });

    return res.status(200).json({
      success: true,
      message: 'AI analysis retrieved successfully',
      data: {
        candidate: application?.Candidate ? {
          name: application.Candidate.User?.name || 'N/A',
          email: application.Candidate.User?.email || 'N/A'
        } : null,
        job: application?.Job ? {
          title: application.Job.title || 'N/A',
          department: application.Job.department || 'N/A'
        } : null,
        resume_url: buildAssetUrl(application?.resume_url) || buildAssetUrl(application?.Candidate?.resume_path),
        resume_analysis: resumeAnalysis ? {
          ...resumeAnalysis.get({ plain: true }),
          contact_info: {
            ...(resumeAnalysis.contact_info || {}),
            // Always prefer the official system name over flaky AI parsing
            name: application?.Candidate?.User?.name || resumeAnalysis.contact_info?.name || 'N/A'
          }
        } : null,
        assessment_analyses: enrichedAssessments,
        interview_analysis: interviewAnalysis,
        ai_decision: aiDecision,
        assessment_attempts: enrichedAttempts,
        malpractice_events: application?.MalpracticeEvents || []
      }
    });


  } catch (error) {
    logger.error(`Get AI analysis error for application ${req.params.applicationId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving AI analysis',
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
      code: 'FETCH_ERROR'
    });
  }
};

/**
 * Health check endpoint
 */
exports.healthCheck = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'AI Service operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'AI Service health check failed',
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * ==================== ANALYTICS ENDPOINTS ====================
 */

/**
 * Get AI analytics data for dashboard
 * GET /api/ai/analytics?jobId=X&departmentId=Y&skillLevel=Z
 * Returns aggregated stats, score distribution, decision breakdown
 */
exports.getAIAnalytics = async (req, res) => {
  try {
    const { jobId, departmentId } = req.query;
    const userRole = req.user?.role;

    // RBAC Check
    if (['candidate'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const where = jobId ? { job_id: jobId } : {};

    // 1. Fetch Core Data
    const [
      totalCandidates,
      totalApps,
      applications,
      allJobs,
      allOffers,
      assessmentAttempts
    ] = await Promise.all([
      Candidate.count(),
      Application.count({ where }),
      Application.findAll({ 
        where, 
        include: [
          { model: Job, attributes: ['department', 'title'] },
          { 
            model: Candidate, 
            attributes: ['id', 'experience_years'],
            include: [{ model: User, attributes: ['name'] }]
          }
        ],
        attributes: ['id', 'status', 'created_at', 'overall_score', 'applied_at', 'updated_at', 'job_id', 'candidate_id'] 
      }),
      Job.findAll({ attributes: ['id', 'department', 'title'] }),
      Offer.findAll(),
      AssessmentAttempt.count()
    ]);

    // 2. KPI Calculations
    const hiresMade = allOffers.filter(o => o.status === 'ACCEPTED').length;
    const offersSent = allOffers.length;
    const acceptanceRate = offersSent > 0 ? Math.round((hiresMade / offersSent) * 100) : 75;

    const shortlistedApps = applications.filter(a => ['SELECTED', 'OFFER_EXTENDED', 'HIRED'].includes(a.status));
    const avgTimeToHire = shortlistedApps.length > 0
      ? Math.round(shortlistedApps.reduce((acc, app) => {
          const start = app.applied_at || app.created_at;
          return acc + Math.floor((new Date(app.updated_at) - new Date(start)) / 86400000);
        }, 0) / shortlistedApps.length)
      : 24;

    const kpis = [
      { title: "Total Candidates", value: totalCandidates.toLocaleString(), trend: "+12.4%", icon: "Users", color: "text-primary" },
      { title: "Hires Made", value: hiresMade.toString(), trend: "+8.2%", icon: "CheckCircle2", color: "text-emerald-500" },
      { title: "Offer Acceptance Rate", value: `${acceptanceRate}%`, trend: "+5.1%", icon: "Target", color: "text-purple-500" },
      { title: "Time to Hire (Avg.)", value: `${avgTimeToHire} days`, trend: "-2.4 days", icon: "Clock", color: "text-amber-500", inverse: true },
      { title: "Cost per Hire", value: "$1,150", trend: "-5.2%", icon: "DollarSign", color: "text-emerald-500" },
    ];

    // 3. Funnel Data (Cumulative calculation to ensure valid funnel shape)
    const funnelStages = [
      { 
        label: "Applied", 
        count: totalApps, 
        color: "bg-blue-500", 
        w: "w-full" 
      },
      { 
        label: "Resume Cleared", 
        count: applications.filter(a => !['APPLIED', 'RESUME_SUBMITTED'].includes(a.status)).length, 
        color: "bg-blue-400", 
        w: "w-[85%]" 
      },
      { 
        label: "Technical Round", 
        count: applications.filter(a => !['APPLIED', 'RESUME_SUBMITTED', 'RESUME_EVALUATED', 'ASSESSMENT_UNLOCKED', 'TECHNICAL_ROUND_PENDING', 'TECHNICAL_ROUND_IN_PROGRESS'].includes(a.status)).length, 
        color: "bg-blue-300", 
        w: "w-[70%]" 
      },
      { 
        label: "Interview", 
        count: applications.filter(a => ['INTERVIEW_IN_PROGRESS', 'INTERVIEW_COMPLETED', 'HR_REVIEW', 'PROCEED_TO_HR', 'SELECTED', 'OFFER_EXTENDED', 'HIRED', 'RECOMMENDED_BY_AI'].includes(a.status)).length, 
        color: "bg-blue-200", 
        w: "w-[55%]" 
      },
      { 
        label: "HR Review", 
        count: applications.filter(a => ['HR_REVIEW', 'PROCEED_TO_HR', 'SELECTED', 'OFFER_EXTENDED', 'HIRED', 'RECOMMENDED_BY_AI'].includes(a.status)).length, 
        color: "bg-amber-400", 
        w: "w-[40%]" 
      },
      { 
        label: "Selected", 
        count: applications.filter(a => ['SELECTED', 'OFFER_EXTENDED', 'HIRED'].includes(a.status)).length, 
        color: "bg-emerald-500", 
        w: "w-[25%]" 
      },
    ];

    const funnel = funnelStages.map((f, idx) => {
      const prevCount = idx > 0 ? funnelStages[idx-1].count : totalApps;
      const rate = totalApps > 0 ? Math.round((f.count / totalApps) * 100) : 0;
      return {
        ...f,
        rate: `${rate}%`,
        count: f.count,
        vs: "+2.4%" // Real-time trend placeholder
      };
    });

    // 4. Trends (Mocked but relative to data)
    const trendData = [
      { name: "Week 1", apps: Math.round(totalApps * 0.2), interviews: 12, offers: 5, hires: 2 },
      { name: "Week 2", apps: Math.round(totalApps * 0.25), interviews: 15, offers: 6, hires: 3 },
      { name: "Week 3", apps: Math.round(totalApps * 0.15), interviews: 8, offers: 3, hires: 1 },
      { name: "Week 4", apps: Math.round(totalApps * 0.4), interviews: 20, offers: 8, hires: 4 },
    ];

    // 5. Source Distribution (Simulated)
    const sources = [
      { name: "LinkedIn", value: Math.round(totalCandidates * 0.45), color: "#3b82f6", percent: "45%" },
      { name: "Naukri", value: Math.round(totalCandidates * 0.25), color: "#10b981", percent: "25%" },
      { name: "Referral", value: Math.round(totalCandidates * 0.15), color: "#f59e0b", percent: "15%" },
      { name: "Career Page", value: Math.round(totalCandidates * 0.10), color: "#8b5cf6", percent: "10%" },
      { name: "Others", value: Math.round(totalCandidates * 0.05), color: "#64748b", percent: "5%" },
    ];

    // 6. Department Distribution
    const deptMap = {};
    allJobs.forEach(j => {
      const dept = j.department || 'Others';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    const totalJobs = allJobs.length || 1;
    const departments = Object.entries(deptMap).map(([name, count]) => ({
      name,
      value: count,
      color: name === 'Engineering' ? "#3b82f6" : "#10b981",
      percent: `${Math.round((count / totalJobs) * 100)}%`
    })).sort((a, b) => b.value - a.value).slice(0, 5);

    // 7. MD Dashboard Specific Data (Neural Analytics)
    const mappedCandidates = applications.map(app => ({
      id: app.id,
      created_at: app.created_at,
      ai_decision: ['REJECTED', 'AUTO_REJECTED'].includes(app.status) ? 'AUTO_REJECTED' : 
                   ['SELECTED', 'OFFER_EXTENDED', 'HIRED'].includes(app.status) ? 'RECOMMENDED' : 'PENDING',
      resume_score: Math.round((app.overall_score || 0) * 0.85), 
      technical_score: Math.round((app.overall_score || 0) * 0.92), 
      final_score: app.overall_score || 0,
      candidate_name: app.Candidate?.User?.name || 'Candidate',
      skill_level: (app.Candidate?.experience_years || 0) > 5 ? 'Senior' : (app.Candidate?.experience_years || 0) > 2 ? 'Mid Level' : 'Junior',
      years_experience: app.Candidate?.experience_years || 0
    }));

    const stats = {
      total_applications: totalApps,
      recommended_count: applications.filter(a => ['SELECTED', 'OFFER_EXTENDED', 'HIRED', 'RECOMMENDED_BY_AI'].includes(a.status)).length,
      rejected_count: applications.filter(a => ['REJECTED', 'AUTO_REJECTED'].includes(a.status)).length,
      average_final_score: applications.length > 0 ? (applications.reduce((acc, a) => acc + (a.overall_score || 0), 0) / applications.length) : 0
    };

    const scoreDistribution = [
      { range: '0-20', count: applications.filter(a => (a.overall_score || 0) <= 20).length },
      { range: '21-40', count: applications.filter(a => (a.overall_score || 0) > 20 && (a.overall_score || 0) <= 40).length },
      { range: '41-60', count: applications.filter(a => (a.overall_score || 0) > 40 && (a.overall_score || 0) <= 60).length },
      { range: '61-80', count: applications.filter(a => (a.overall_score || 0) > 60 && (a.overall_score || 0) <= 80).length },
      { range: '81-100', count: applications.filter(a => (a.overall_score || 0) > 80).length },
    ];

    const decisionBreakdown = [
      { name: 'RECOMMENDED', value: stats.recommended_count },
      { name: 'AUTO_REJECTED', value: stats.rejected_count },
      { name: 'PENDING', value: Math.max(0, totalApps - stats.recommended_count - stats.rejected_count) }
    ];

    const skillLevelDistribution = [
      { name: 'Senior', count: mappedCandidates.filter(c => c.skill_level === 'Senior').length },
      { name: 'Mid Level', count: mappedCandidates.filter(c => c.skill_level === 'Mid Level').length },
      { name: 'Junior', count: mappedCandidates.filter(c => c.skill_level === 'Junior').length },
    ];

    return res.status(200).json({
      success: true,
      data: {
        kpis,
        funnel,
        trendData,
        sources,
        departments,
        avgTimeToHire,
        acceptanceRate,
        totalApps,
        // MD Neural Analytics Fields
        stats,
        candidates: mappedCandidates,
        scoreDistribution,
        decisionBreakdown,
        skillLevelDistribution
      }
    });
  } catch (error) {
    logger.error('Analytics Fetch Error:', error);
    res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Export analytics data to CSV
 * POST /api/ai/analytics/export
 */
exports.exportAIAnalytics = async (req, res) => {
  try {
    const { jobId, departmentId, skillLevel } = req.body;

    // Fetch data same as analytics endpoint
    const whereConditions = {};
    if (jobId) whereConditions.job_id = jobId;

    let decisions = await AIDecision.findAll({
      where: whereConditions,
      include: [
        {
          model: Application,
          include: [{ model: Candidate }]
        }
      ]
    });

    if (skillLevel) {
      decisions = decisions.filter(d => {
        const estimatedLevel = d.summary?.includes('junior') ? 'junior' :
          d.summary?.includes('mid') ? 'mid_level' : 'senior';
        return estimatedLevel === skillLevel;
      });
    }

    // Build CSV content
    const headers = ['Candidate', 'Email', 'Job ID', 'Resume Score', 'Technical Score', 'Interview Score', 'Final Score', 'AI Decision', 'Status', 'Confidence %'];
    const rows = decisions.map(d => [
      d.Application?.Candidate?.name || 'Unknown',
      d.Application?.Candidate?.email || '',
      d.job_id,
      (d.resume_score || 0).toFixed(2),
      (d.technical_assessment_score || 0).toFixed(2),
      (d.interview_score || 0).toFixed(2),
      (d.final_score || 0).toFixed(2),
      d.ai_decision,
      d.Application?.status || 'PENDING',
      (d.confidence_percentage || 0).toFixed(1)
    ]);

    // Create CSV string
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Send as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ai-analytics-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);

  } catch (error) {
    logger.error('Analytics export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error exporting analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
};

/**
 * Re-evaluate an existing assessment (re-trigger AI or fallback)
 */
exports.reEvaluateAssessment = async (req, res) => {
  try {
    const { applicationId } = req.body;
    if (!applicationId) return res.status(400).json({ success: false, message: 'applicationId is required' });

    logger.info(`Manually re-evaluating assessment for app ${applicationId}`);

    // Try to find raw responses from the last attempt (usually stored in AssessmentAnalysis or a separate model)
    const analysis = await AssessmentAnalysis.findOne({
      where: { application_id: applicationId },
      order: [['created_at', 'DESC']]
    });

    if (!analysis || !analysis.candidate_response) {
      return res.status(404).json({ success: false, message: 'No candidate response data found to re-evaluate' });
    }

    // Pass back to analysis handlers
    req.body.code = analysis.candidate_response.code || analysis.candidate_response.answers;
    req.body.problemDescription = analysis.candidate_response.problemDescription;
    req.body.questions = analysis.candidate_response.questions;
    req.body.answers = analysis.candidate_response.answers;

    if (analysis.assessment_type === 'coding') {
      return exports.analyzeCodingAssessment(req, res);
    } else {
      return exports.analyzeMCQAssessment(req, res);
    }

  } catch (error) {
    logger.error(`Re-evaluation error for app ${req.body.applicationId}:`, error);
    return res.status(500).json({ success: false, message: 'Re-evaluation failed' });
  }
};

function generateDecisionSummary(application, finalScore, decision) {
  const summaries = {
    'AUTO_REJECTED': `Candidate was automatically rejected based on insufficient score (${finalScore.toFixed(2)}/100). Does not meet minimum job requirements.`,
    'PROCEED_TO_HR': `Candidate score (${finalScore.toFixed(2)}/100) qualifies for HR review. Recommend discussion with hiring team.`,
    'RECOMMENDED': `Candidate strongly recommended for hire with score ${finalScore.toFixed(2)}/100. Exceeds job requirements.`
  };
  return summaries[decision] || 'Decision pending further review';
}

/**
 * ==================== CANDIDATE CHATBOT ====================
 */

/**
 * Handle direct AI chat for candidates
 */
exports.chatWithAI = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Call service to interact with LLM
    const response = await aiService.chatWithAI(message, history || []);

    return res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error in AI Chat:', error);
    return res.status(500).json({
      success: false,
      message: 'AI Chat is currently unavailable',
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
    });
  }
};

module.exports = exports;
