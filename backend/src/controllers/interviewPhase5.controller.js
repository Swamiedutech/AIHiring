/**
 * AI Interview Module - Phase 5
 * Handles video interviews, sentiment analysis, and AI scoring
 */

const {
  Application,
  InterviewSession,
  InterviewAnswer,
  ApplicationStatusLog,
  CandidateSession,
  Notification,
  InterviewQuestionBank,
  InterviewAnalysis,
  Job,
  NotificationQueue
} = require('../models');
const { sequelize, Sequelize } = require('../config/db');
const { Op } = Sequelize;
const fs = require('fs');
const path = require('path');
const aiService = require('../services/ai.service');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// Job Role Mapping for Interview Questions
const mapJobToInterviewRole = (jobTitle, department) => {
  const title = jobTitle?.toLowerCase() || '';
  const dept = department?.toLowerCase() || '';

  if (title.includes('management trainee')) {
  return 'MANAGEMENT_TRAINEE_MARKETING';
}

if (title.includes('executive')) {
  return 'EXECUTIVE_MARKETING';
}

if (title.includes('assistant manager')) {
  return 'ASSISTANT_MANAGER_MARKETING';
}

if (title.includes('rubber process')) {
  return 'RUBBER_PROCESS_ENGINEER';
}

  // Default mappings for other roles
  if (title.includes('senior ai') || title.includes('ai engineer')) {
    return 'SENIOR_AI_ENGINEER';
  }
  if (title.includes('full stack') || title.includes('developer')) {
    return 'FULL_STACK_DEVELOPER';
  }
  if (title.includes('data scientist')) {
    return 'DATA_SCIENTIST';
  }
  if (title.includes('qa') || title.includes('quality')) {
    return 'QA_ENGINEER';
  }
  if (title.includes('devops')) {
    return 'DEVOPS_ENGINEER';
  }  return null; // No matching role found
};

// ================= GET CONFIG =================
exports.getInterviewConfig = (req, res) => {
  res.json(INTERVIEW_CONFIG);
};

// Interview Configuration
const INTERVIEW_CONFIG = {
  DURATION_MINUTES: 60,
  TOTAL_QUESTIONS: 10,
  TECH_QUESTIONS: 7,
  BEHAVIORAL_QUESTIONS: 3,
  VIDEO_RECORDING: true,
  AUDIO_ONLY_FALLBACK: true,
  SENTIMENT_ANALYSIS: true,
  MAX_SILENCE_SECONDS: 30,
  MIN_RESPONSE_SECONDS: 5,
  MAX_RESPONSE_SECONDS: 300,
  PASSING_SCORE: 60
};

/**
 * Schedule Interview - AI Interview Module (Phase 5)
 */
exports.scheduleInterviewPhase5 = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { scheduled_date, scheduled_time, interview_type } = req.body;
    const userId = req.user.id;

    if (!['HR', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only HR/Admin can schedule interviews' });
    }

    const application = await Application.findByPk(applicationId, {
      include: 'Candidate'
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'TECHNICAL_ROUND_COMPLETED') {
      return res.status(400).json({
        error: 'Interview can only be scheduled after technical round completion',
        current_status: application.status
      });
    }

    const existingSession = await InterviewSession.findOne({
      where: {
        application_id: applicationId,
        status: { [Op.ne]: 'CANCELLED' }
      }
    });

    if (existingSession) {
      return res.status(400).json({
        error: 'Interview already scheduled for this application',
        existing_schedule: existingSession.scheduled_date
      });
    }

    const scheduledDateTime = new Date(`${scheduled_date}T${scheduled_time}`);
    if (scheduledDateTime < new Date()) {
      return res.status(400).json({ error: 'Cannot schedule interview in the past' });
    }

    const expiresAt = new Date(scheduledDateTime.getTime() + (10 * 60 * 60 * 1000)); // 10 hours window

    const interviewSession = await InterviewSession.create({
      application_id: applicationId,
      interview_type: interview_type || 'VIDEO',
      status: 'SCHEDULED',
      scheduled_date: scheduledDateTime,
      expires_at: expiresAt,
      questions_asked: [],
      scheduled_by: userId,
      metadata: {
        scheduled_at: new Date(),
        timezone: req.body.timezone || 'UTC'
      }
    });

    await application.update({
      status: 'INTERVIEW_SCHEDULED',
      updated_at: new Date()
    });

    await ApplicationStatusLog.create({
      application_id: applicationId,
      previous_status: 'TECHNICAL_ROUND_COMPLETED',
      new_status: 'INTERVIEW_SCHEDULED',
      changed_by: userId,
      metadata: {
        interview_type,
        scheduled_date: scheduledDateTime
      },
      changed_at: new Date()
    });

    // Notify Candidate
    try {
      await NotificationQueue.create({
        candidate_id: application.Candidate.id,
        application_id: application.id,
        notification_type: 'INTERVIEW_SCHEDULED',
        title: 'Interview Scheduled 🎥',
        message: `Your AI interview has been scheduled for ${scheduledDateTime.toLocaleString()}. Note: The link will expire automatically 10 hours after the scheduled time.`,
        action_url: `/candidate/interview/${applicationId}`,
        send_email: true
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Interview scheduled successfully',
      data: {
        id: interviewSession.id,
        scheduled_date: interviewSession.scheduled_date,
        status: interviewSession.status
      }
    });
  } catch (error) {
    console.error('Schedule Interview Error:', error);
    res.status(500).json({ error: 'Failed to schedule interview' });
  }
};

/**
 * Start Interview - Initialize recording and first question
 */
/**
 * Start Interview - AI Interview Module (Phase 5)
 */
exports.startInterviewPhase5 = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const candidateId = req.candidate.id;

    const application = await Application.findOne({
      where: { id: applicationId, candidate_id: candidateId },
      include: [{ model: Job }]
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const ALLOWED = ['INTERVIEW_UNLOCKED', 'INTERVIEW_IN_PROGRESS', 'RE_INTERVIEW_REQUESTED', 'INTERVIEW_SCHEDULED'];
    if (!ALLOWED.includes(application.status)) {
      return res.status(403).json({ 
        error: 'Interview is not available yet. Status: ' + application.status
      });
    }

    let interviewSession = await InterviewSession.findOne({
      where: { 
        application_id: applicationId, 
        status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] } 
      }
    });

    if (!interviewSession && application.status === 'INTERVIEW_UNLOCKED') {
      // Auto-create session for self-start interviews
      interviewSession = await InterviewSession.create({
        application_id: applicationId,
        interview_type: 'VIDEO',
        status: 'IN_PROGRESS',
        scheduled_at: new Date(),
        questions_asked: [],
        metadata: { auto_created: true, created_at: new Date() }
      });
      
      await application.update({ status: 'INTERVIEW_IN_PROGRESS' });
    }

    if (!interviewSession) {
      return res.status(400).json({ error: 'Interview not scheduled or completed.' });
    }

    // 🔥 Strict Start Time Check
    if (interviewSession.status === 'SCHEDULED' && interviewSession.scheduled_at && new Date() < new Date(interviewSession.scheduled_at)) {
      return res.status(403).json({ 
        error: 'Interview session has not started.',
        message: `Your interview is strictly scheduled to start at ${new Date(interviewSession.scheduled_at).toLocaleString()}. Please return at the scheduled time.`
      });
    }

    // 🔥 Expiry Check (10-hour window)
    if (interviewSession.expires_at && new Date() > new Date(interviewSession.expires_at)) {
      if (interviewSession.status === 'SCHEDULED') {
        await interviewSession.update({ status: 'FAILED', notes: 'Auto-locked: 10-hour window exceeded.' });
      }
      return res.status(403).json({ 
        error: 'Interview session has expired.',
        message: 'The 10-hour window to attempt this interview has passed. Please contact HR.'
      });
    }

    if (interviewSession.status === 'IN_PROGRESS' && interviewSession.questions_asked?.length > 0) {
      return res.json({
        success: true,
        interview_session_id: interviewSession.id,
        status: 'IN_PROGRESS',
        resumed: true,
        current_question: interviewSession.questions_asked[interviewSession.questions_asked.length - 1],
        question_number: interviewSession.questions_asked.length,
        started_at: interviewSession.started_at,
        expires_at: new Date(interviewSession.started_at.getTime() + INTERVIEW_CONFIG.DURATION_MINUTES * 60 * 1000)
      });
    }

    const job = application.Job;
    const questionRole = mapJobToInterviewRole(job.title, job.department);

    // 1. Fetch ALL Questions from Database (Prioritize Job-specific)
    // First, try to find an introductory question in the DB
    let introQ = await InterviewQuestionBank.findOne({
      where: { 
        [Op.or]: [{ jobId: job.id }, { jobRole: questionRole }],
        category: 'INTRODUCTORY' 
      },
      order: sequelize.literal('RANDOM()')
    });

    // 2. Fetch Technical Questions from DB
    let techQuestions = await InterviewQuestionBank.findAll({
      where: { 
        [Op.or]: [{ jobId: job.id }, { jobRole: questionRole }],
        category: { [Op.notIn]: ['BEHAVIORAL', 'INTRODUCTORY'] }
      },
      order: sequelize.literal('RANDOM()'),
      limit: INTERVIEW_CONFIG.TECH_QUESTIONS
    });

    // 3. Fetch Behavioral from DB
    let behavioralQuestions = await InterviewQuestionBank.findAll({
      where: { 
        [Op.or]: [{ jobId: job.id }, { jobRole: questionRole }],
        category: 'BEHAVIORAL' 
      },
      order: sequelize.literal('RANDOM()'),
      limit: INTERVIEW_CONFIG.BEHAVIORAL_QUESTIONS
    });

    // 4. Combine and fill gaps
    let finalQuestions = [];
    
    // Tech part
    if (techQuestions.length < INTERVIEW_CONFIG.TECH_QUESTIONS) {
      const extraTech = await InterviewQuestionBank.findAll({
        where: { 
          [Op.or]: [{ jobId: job.id }, { jobRole: questionRole }],
          category: { [Op.notIn]: ['BEHAVIORAL', 'INTRODUCTORY'] },
          questionId: { [Op.notIn]: techQuestions.map(q => q.questionId) }
        },
        order: sequelize.literal('RANDOM()'),
        limit: INTERVIEW_CONFIG.TECH_QUESTIONS - techQuestions.length
      });
      techQuestions.push(...extraTech);
    }
    finalQuestions.push(...techQuestions.slice(0, INTERVIEW_CONFIG.TECH_QUESTIONS));

    // Behavioral part
    if (behavioralQuestions.length < INTERVIEW_CONFIG.BEHAVIORAL_QUESTIONS) {
      const extraBeh = await InterviewQuestionBank.findAll({
        where: { 
          [Op.or]: [{ jobId: job.id }, { jobRole: questionRole }],
          category: 'BEHAVIORAL',
          questionId: { [Op.notIn]: behavioralQuestions.map(q => q.questionId) }
        },
        order: sequelize.literal('RANDOM()'),
        limit: INTERVIEW_CONFIG.BEHAVIORAL_QUESTIONS - behavioralQuestions.length
      });
      behavioralQuestions.push(...extraBeh);
    }
    finalQuestions.push(...behavioralQuestions.slice(0, INTERVIEW_CONFIG.BEHAVIORAL_QUESTIONS));

    // Shuffle final set
    finalQuestions.sort(() => Math.random() - 0.5);

    if (finalQuestions.length < INTERVIEW_CONFIG.TOTAL_QUESTIONS) {
       // Absolute fallback if everything fails, pad with whatever we have
       const needed = INTERVIEW_CONFIG.TOTAL_QUESTIONS - finalQuestions.length;
       const any = await InterviewQuestionBank.findAll({ 
         where: { questionId: { [Op.notIn]: finalQuestions.map(q => q.questionId) } },
         order: sequelize.literal('RANDOM()'), 
         limit: needed 
       });
       finalQuestions.push(...any);
    }

    if (finalQuestions.length === 0) {
      return res.status(400).json({ error: 'No interview questions found in database. Please contact admin.' });
    }

    await interviewSession.update({
      status: 'IN_PROGRESS',
      started_at: new Date(),
      questions_asked: finalQuestions.map(q => ({
        id: q.questionId,
        question: q.question,
        category: q.category,
        difficulty: q.difficulty,
        expectedAnswer: q.expectedAnswer,
        keywords: q.keywords || []
      }))
    });

    await application.update({ status: 'INTERVIEW_IN_PROGRESS' });

    res.json({
      success: true,
      interview_session_id: interviewSession.id,
      status: 'IN_PROGRESS',
      current_question: {
        id: finalQuestions[0].questionId,
        question: finalQuestions[0].question,
        category: finalQuestions[0].category,
        difficulty: finalQuestions[0].difficulty
      },
      question_number: 1,
      started_at: interviewSession.started_at,
      expires_at: new Date(interviewSession.started_at.getTime() + INTERVIEW_CONFIG.DURATION_MINUTES * 60 * 1000)
    });
  } catch (error) {
    console.error('Start Interview Error:', error);
    res.status(500).json({ error: 'Failed to start interview', details: error.message });
  }
};

/**
 * Submit Interview Response - Save video, transcription, analysis
 */
exports.submitResponsePhase5 = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const candidateId = req.candidate.id;
    
    // Parse complex data if coming via FormData
    let payload = req.body;
    if (req.body.data) {
      try {
        payload = JSON.parse(req.body.data);
      } catch (e) {
        console.error("JSON Parse Error in response submission:", e);
      }
    }

    const {
      question_id,
      transcription,
      response_duration_seconds,
      question_number
    } = payload;

    const interviewSession = await InterviewSession.findByPk(sessionId, {
      include: [{
        model: Application,
        where: { candidate_id: candidateId }
      }]
    });

    if (!interviewSession) {
      return res.status(404).json({ error: 'Interview session not found or access denied' });
    }

    const applicationId = interviewSession.application_id;
    const application = interviewSession.Application;

    if (response_duration_seconds < INTERVIEW_CONFIG.MIN_RESPONSE_SECONDS) {
      return res.status(400).json({
        error: `Response too short. Minimum ${INTERVIEW_CONFIG.MIN_RESPONSE_SECONDS} seconds required.`,
        your_duration: response_duration_seconds
      });
    }

    let recordingPath = null;
    if (req.file) {
      // multer diskStorage already saved the file to disk
      recordingPath = `/uploads/interviews/${req.file.filename}`;
    }

    const storedQuestions = [...(interviewSession.questions_asked || [])];
    
    // Enforce server-side tracking
    const expectedIndex = storedQuestions.findIndex(q => !q.response_text && !q.answered_at);
    if (expectedIndex === -1) {
      return res.status(400).json({ error: 'All questions have already been answered.' });
    }

    const qIndex = storedQuestions.findIndex(q => String(q.id) === String(question_id));
    if (qIndex === -1 || qIndex !== expectedIndex) {
      return res.status(400).json({ error: 'Out of order question submission or invalid ID.' });
    }

    const currentStoredQ = storedQuestions[qIndex];
    const expectedAnswer = currentStoredQ.expectedAnswer || "";

    const analysis = await analyzeResponse(transcription || "", expectedAnswer);

    const questionResponse = {
      question_id,
      question_number: expectedIndex + 1, // Server-side tracked
      question_text: currentStoredQ.question || "Question",
      expectedAnswer,
      response_text: transcription || "",
      response_duration_seconds,
      recording_path: recordingPath,
      analysis: analysis,
      answered_at: new Date()
    };

    // Update the specific question with response
    storedQuestions[qIndex] = {
      ...storedQuestions[qIndex],
      ...questionResponse
    };
    
    const questionsAsked = storedQuestions;
    interviewSession.changed('questions_asked', true);

    const isLastQuestion = expectedIndex >= INTERVIEW_CONFIG.TOTAL_QUESTIONS - 1 || expectedIndex === storedQuestions.length - 1;

    if (isLastQuestion) {
      logger.info(`[Interview] Final question reached for session ${sessionId}. Finalizing...`);
      await interviewSession.update({
        questions_asked: questionsAsked,
        status: 'EVALUATION_PENDING', 
        submitted_at: new Date()
      });

      logger.info(`[Interview] Session ${sessionId} submitted and queued for background evaluation.`);
 
      // Create notification
      try {
        await NotificationQueue.create({
          candidate_id: candidateId,
          application_id: applicationId,
          notification_type: 'INTERVIEW_COMPLETED',
          title: 'Interview Completed 🎥',
          message: 'Thank you for completing the AI interview! Our team will review your responses.',
          action_url: `/candidate/applications/${applicationId}`,
          status: 'PENDING'
        });
      } catch (notifErr) {
        logger.warn(`[Notification] Failed to create interview completion notification: ${notifErr.message}`);
      }
 
      return res.json({
        success: true,
        interview_complete: true,
        interview_score: Math.round(interviewScore),
        message: 'Interview submitted successfully'
      });
    }

    await interviewSession.update({ questions_asked: questionsAsked });

    // Get next question from stored questions
    const nextQuestion = questionsAsked[question_number];
    if (!nextQuestion) {
       throw new Error(`Next question (index ${question_number}) not found in session.`);
    }

    res.json({
      success: true,
      response_saved: true,
      analysis,
      current_question: {
        id: nextQuestion.id,
        question: nextQuestion.question,
        category: nextQuestion.category,
        difficulty: nextQuestion.difficulty
      },
      question_number: question_number + 1,
      total_questions: INTERVIEW_CONFIG.TOTAL_QUESTIONS,
      interview_complete: false
    });
  } catch (error) {
    logger.error('Submit Response Error:', error);
    res.status(500).json({ error: 'Failed to submit response', details: error.message });
  }
};

/**
 * Get Interview Status
 */
exports.getInterviewStatusPhase5 = async (req, res) => {
  try {
    const { applicationId, sessionId } = req.params;

    const interviewSession = await InterviewSession.findOne({
      where: {
        id: sessionId,
        application_id: applicationId
      }
    });

    if (!interviewSession) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    const questionsAsked = interviewSession.questions_asked || [];
    const currentQuestionNumber = questionsAsked.length + 1;
    const isComplete = interviewSession.status === 'SUBMITTED';

    let timeRemaining = null;
    if (interviewSession.started_at && !isComplete) {
      const elapsed = Date.now() - new Date(interviewSession.started_at).getTime();
      const timeLimit = INTERVIEW_CONFIG.DURATION_MINUTES * 60 * 1000;
      timeRemaining = Math.max(0, timeLimit - elapsed);
    }

    res.json({
      success: true,
      session_id: interviewSession.id,
      status: interviewSession.status,
      questions_answered: questionsAsked.length,
      total_questions: INTERVIEW_CONFIG.TOTAL_QUESTIONS,
      current_question_number: currentQuestionNumber,
      is_complete: isComplete,
      time_remaining_ms: timeRemaining,
      time_limit_minutes: INTERVIEW_CONFIG.DURATION_MINUTES,
      started_at: interviewSession.started_at,
      expires_at: interviewSession.expires_at,
      submitted_at: interviewSession.submitted_at
    });
  } catch (error) {
    console.error('Get Interview Status Error:', error);
    res.status(500).json({ error: 'Failed to get interview status' });
  }
};

/**
 * Get Interview Status by Application ID
 */
exports.getInterviewStatusByApplicationId = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const candidateId = req.candidate.id;

    const interviewSession = await InterviewSession.findOne({
      where: {
        application_id: applicationId,
        candidate_id: candidateId,
        status: { [Op.ne]: 'CANCELLED' }
      }
    });

    if (!interviewSession) {
      return res.json({ success: true, exists: false });
    }

    res.json({
      success: true,
      exists: true,
      session_id: interviewSession.id,
      status: interviewSession.status,
      scheduled_at: interviewSession.scheduled_at,
      expires_at: interviewSession.expires_at,
      questions_answered: (interviewSession.questions_asked || []).filter(q => q.answered_at).length,
      total_questions: INTERVIEW_CONFIG.TOTAL_QUESTIONS
    });
  } catch (error) {
    console.error('Get Interview Status By App Error:', error);
    res.status(500).json({ error: 'Failed to get interview status' });
  }
};

/**
 * Get Interview Results (HR/Admin)
 */
exports.getInterviewResultsPhase5 = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const interviewSession = await InterviewSession.findOne({
      where: {
        application_id: applicationId,
        status: { [Op.in]: ['SUBMITTED', 'COMPLETED'] }
      }
    });

    if (!interviewSession) {
      return res.status(404).json({ error: 'Interview not completed' });
    }

    const questionsAsked = interviewSession.questions_asked || [];

    const avgSentiment = questionsAsked.reduce((sum, q) => sum + (q.analysis?.sentiment || 0), 0) / questionsAsked.length;
    const avgConfidence = questionsAsked.reduce((sum, q) => sum + (q.analysis?.confidence || 0), 0) / questionsAsked.length;
    const totalResponseTime = questionsAsked.reduce((sum, q) => sum + q.response_duration_seconds, 0);

    res.json({
      success: true,
      interview_session_id: interviewSession.id,
      interview_type: interviewSession.interview_type,
      started_at: interviewSession.started_at,
      submitted_at: interviewSession.submitted_at,
      duration_seconds: Math.floor((interviewSession.submitted_at - interviewSession.started_at) / 1000),
      questions_count: questionsAsked.length,
      responses: questionsAsked.map(q => ({
        question_number: q.question_number,
        question: q.question_text,
        response: q.response_text,
        duration_seconds: q.response_duration_seconds,
        sentiment: q.analysis?.sentiment,
        confidence: q.analysis?.confidence,
        clarity: q.analysis?.clarity,
        relevance: q.analysis?.relevance,
        keywords: q.analysis?.keywords,
        recording_path: q.recording_path
      })),
      summary: {
        average_sentiment: Math.round(avgSentiment * 100),
        average_confidence: Math.round(avgConfidence * 100),
        total_response_time_seconds: totalResponseTime,
        avg_response_time_seconds: Math.round(totalResponseTime / questionsAsked.length)
      }
    });
  } catch (error) {
    console.error('Get Interview Results Error:', error);
    res.status(500).json({ error: 'Failed to get interview results' });
  }
};

// ==================== GET INTERVIEW ANALYSIS (HR + MD) ====================
exports.getInterviewAnalysis = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const interviewSession = await InterviewSession.findOne({
      where: { application_id: applicationId, status: 'COMPLETED' }
    });

    if (!interviewSession) {
      return res.status(404).json({ error: 'Interview not completed yet' });
    }

    const analysis = await InterviewAnalysis.findOne({ where: { application_id: applicationId } });

    const questionsAsked = interviewSession.questions_asked || [];

    return res.json({
      success: true,
      interview_session_id: interviewSession.id,
      started_at: interviewSession.started_at,
      submitted_at: interviewSession.submitted_at,
      questions_count: questionsAsked.length,
      ai_analysis: analysis ? {
        final_score: analysis.overall_score,
        rating: analysis.rating,
        recommendation: analysis.hire_recommendation,
        dimension_scores: {
          technical: (analysis.technical_knowledge_score || 0) / 10,
          communication: (analysis.communication_score || 0) / 10,
          problem_solving: (analysis.problem_solving_score || 0) / 10,
          soft_skills: (analysis.soft_skills_score || 0) / 10,
          cultural_fit: (analysis.cultural_fit_score || 0) / 10,
          confidence: analysis.confidence_level,
        },
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        green_flags: analysis.green_flags || [],
        red_flags: analysis.red_flags || [],
        detailed_feedback: analysis.detailed_evaluation,
        scoring_rationale: analysis.scoring_rationale,
      } : null,
      responses: questionsAsked.map(q => ({
        question_number: q.question_number,
        question: q.question_text,
        response: q.response_text,
        duration_seconds: q.response_duration_seconds
      }))
    });
  } catch (error) {
    console.error('Get Interview Analysis Error:', error);
    res.status(500).json({ error: 'Failed to get interview analysis' });
  }
};

// ==================== HELPER FUNCTIONS ====================

async function saveRecording(sessionId, questionId, blob, type) {
  return new Promise((resolve, reject) => {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads/interviews');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `${sessionId}_q${questionId}_${Date.now()}.${type === 'video' ? 'webm' : 'wav'}`;
      const filepath = path.join(uploadsDir, filename);

      fs.writeFile(filepath, Buffer.from(blob), (err) => {
        if (err) reject(err);
        resolve(`/uploads/interviews/${filename}`);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function analyzeResponse(transcription, expectedAnswer = "") {
  const fillerCount = countFillerWords(transcription);
  const wordCount = transcription ? transcription.split(' ').length : 0;
  
  // Calculate Cosine Similarity if expected answer exists
  let similarityScore = 0.5; // Default neutral if no expected answer
  if (expectedAnswer && transcription) {
    similarityScore = calculateCosineSimilarity(transcription, expectedAnswer);
  }

  const sentimentScore = calculateSentiment(transcription, fillerCount, wordCount);

  return {
    sentiment: sentimentScore,
    confidence: Math.max(0.3, 1 - (fillerCount / Math.max(1, wordCount)) * 3),
    clarity: calculateClarity(transcription),
    relevance: similarityScore, // Using cosine similarity for relevance
    keywords: extractKeywords(transcription),
    word_count: wordCount,
    filler_words: fillerCount,
    cosine_similarity: similarityScore
  };
}

function calculateSentiment(text, fillerCount, wordCount) {
  if (!text) return 0.5;
  const pos = ['great', 'excellent', 'achieved', 'successfully', 'learned', 'team', 'collaborate', 'solved', 'improved', 'passionate'];
  const neg = ['fail', 'difficult', 'bad', 'stuck', 'hate', 'worry', 'slow', 'error', 'issue', 'problem'];
  
  const lower = text.toLowerCase();
  let score = 0.6; // Start slightly positive
  
  pos.forEach(w => { if (lower.includes(w)) score += 0.05; });
  neg.forEach(w => { if (lower.includes(w)) score -= 0.05; });
  
  // Penalty for too many fillers
  score -= (fillerCount / Math.max(1, wordCount)) * 0.5;
  
  return Math.min(1, Math.max(0, score));
}

function calculateCosineSimilarity(str1, str2) {
  const termFreq = (str) => {
    const words = str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const freq = {};
    words.forEach(w => { if (w.length > 2) freq[w] = (freq[w] || 0) + 1; });
    return freq;
  };

  const v1 = termFreq(str1);
  const v2 = termFreq(str2);

  const allWords = new Set([...Object.keys(v1), ...Object.keys(v2)]);
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  allWords.forEach(word => {
    const val1 = v1[word] || 0;
    const val2 = v2[word] || 0;
    dotProduct += val1 * val2;
    mag1 += val1 * val1;
    mag2 += val2 * val2;
  });

  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}


const scoringService = require('../services/scoring.service');

/**
 * Gemini AI Interview Analysis — 6-dimension + weighted final score
 * Enhancements: Hybrid Fallback + ML Validation
 */
async function runGeminiInterviewAnalysis(questionsAsked) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: process.env.GENAI_MODEL || 'gemini-2.0-flash' });

  // 1. Calculate ML Validation Score (Cosine Similarity)
  let totalCosine = 0;
  let validPairs = 0;

  for (const q of questionsAsked) {
    if (q.response_text && q.expected_answer) {
      const sim = scoringService.calculateCosineSimilarity(q.response_text, q.expected_answer);
      totalCosine += sim;
      validPairs++;
    }
  }

  const mlCosineScore = validPairs > 0 ? (totalCosine / validPairs) * 100 : 50;

  const qaPairs = questionsAsked.map((q, i) =>
    `Q${i + 1}: ${q.question_text || 'N/A'}\nA${i + 1}: ${q.response_text || '(no response)'}\nDuration: ${q.response_duration_seconds || 0}s`
  ).join('\n\n');

  const prompt = `You are an expert HR analyst. Analyze this interview transcript and output a structured JSON.
  TRANSCRIPT:
  ${qaPairs}
  
  EVALUATE Content (Accuracy), Communication, Confidence, and Behavioral engagement (0-10 each).
  Return JSON:
  {
    "ai_score": <0-100>,
    "dimension_scores": { "content": <0-10>, "communication": <0-10>, "confidence": <0-10>, "behavior": <0-10> },
    "strengths": [], "weaknesses": [], "feedback": "", "recommendation": "Strong Hire/Hire/Hold/Reject"
  }`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
    const aiData = JSON.parse(jsonStr);

    // Hybrid Logic: (AI * 0.6) + (Cosine * 0.4)
    const hybridScore = Math.round((aiData.ai_score * 0.6) + (mlCosineScore * 0.4));

    return {
      ...aiData,
      final_score: hybridScore,
      ml_validation_score: mlCosineScore,
      method: 'AI_HYBRID'
    };

  } catch (error) {
    logger.warn(`Interview AI analysis failed, falling back to ML Regression: ${error.message}`);
    
    // Fallback: ML Weighted Regression Simulation
    const prediction = await scoringService.predictFinalScore({
      jobId: questionsAsked[0]?.jobId, // Attempt to get jobId if available
      cosineScore: mlCosineScore,
      aiAvailable: false,
      interviewScore: mlCosineScore // Use similarity as base
    });

    return {
      final_score: prediction.finalScore,
      ml_validation_score: mlCosineScore,
      method: 'ML_FALLBACK',
      strengths: prediction.insights.strengths,
      weaknesses: prediction.insights.weaknesses,
      recommendation: prediction.classification,
      feedback: prediction.insights.recommendation
    };
  }
}

function calculateClarity(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const avgWordsPerSentence = text.split(' ').length / (sentences.length || 1);
  
  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20) return 0.9;
  if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) return 0.7;
  if (avgWordsPerSentence >= 6 && avgWordsPerSentence <= 30) return 0.5;
  return 0.3;
}

function calculateRelevance(text) {
  const keywords = ['implement', 'design', 'optimize', 'improve', 'scalable', 'solution', 'architecture', 'database', 'API', 'microservices'];
  const lowerText = text.toLowerCase();
  const matches = keywords.filter(k => lowerText.includes(k)).length;
  
  return Math.min(1, matches / keywords.length);
}

function extractKeywords(text) {
  const technicalTerms = [
    'python', 'javascript', 'java', 'golang', 'rust',
    'react', 'vue', 'angular', 'node.js',
    'database', 'sql', 'nosql', 'mongodb', 'postgresql',
    'microservices', 'kubernetes', 'docker',
    'api', 'rest', 'graphql',
    'machine learning', 'ai', 'aws', 'azure', 'gcp'
  ];

  const lowerText = text.toLowerCase();
  return technicalTerms.filter(term => lowerText.includes(term));
}

function countFillerWords(text) {
  const fillers = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so'];
  let count = 0;
  fillers.forEach(filler => {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    count += (text.match(regex) || []).length;
  });
  return count;
}

function calculateInterviewScore(questionsAsked) {
  if (questionsAsked.length === 0) return 0;

  let totalScore = 0;

  questionsAsked.forEach(q => {
    let questionScore = 0;

    questionScore += (q.analysis?.sentiment || 0.5) * 25;
    questionScore += (q.analysis?.confidence || 0.5) * 25;

    const duration = q.response_duration_seconds;
    const optimalDuration = 60;
    if (duration >= optimalDuration * 0.8 && duration <= optimalDuration * 1.5) {
      questionScore += 25;
    } else if (duration >= optimalDuration * 0.5 && duration <= optimalDuration * 2) {
      questionScore += 15;
    } else {
      questionScore += 5;
    }

    questionScore += (q.analysis?.relevance || 0.5) * 25;

    totalScore += questionScore / 4;
  });

  return Math.round(totalScore / questionsAsked.length);
}

module.exports = {
  scheduleInterviewPhase5: exports.scheduleInterviewPhase5,
  startInterviewPhase5: exports.startInterviewPhase5,
  submitResponsePhase5: exports.submitResponsePhase5,
  getInterviewStatusPhase5: exports.getInterviewStatusPhase5,
  getInterviewStatusByApplicationId: exports.getInterviewStatusByApplicationId,
  getInterviewResultsPhase5: exports.getInterviewResultsPhase5,
  getInterviewAnalysis: exports.getInterviewAnalysis,
  getInterviewConfig: exports.getInterviewConfig,
  INTERVIEW_CONFIG
};