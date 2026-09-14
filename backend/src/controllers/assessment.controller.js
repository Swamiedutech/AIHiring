const { 
  Application,
  AssessmentAttempt, 
  TechnicalQuestionBank, 
  ApplicationStatusLog, 
  Job, 
  AssessmentAnalysis, 
  MalpracticeEvent 
} = require('../models');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const aiService = require("../services/ai.service");
const scoringService = require('../services/scoring.service');
const logger = require("../utils/logger");

const ASSESSMENT_CONFIG = {
  SECTION1_MCQ_COUNT: 20,
  SECTION1_DURATION_MINUTES: 20,
  SECTION2_THEORY_COUNT: 5,
  SECTION2_DURATION_MINUTES: 25,
  TOTAL_QUESTIONS: 25,
  TOTAL_DURATION_MINUTES: 45,
  PASSING_SCORE: 40,
  MCQ_WEIGHT: 0.6,    // Section 1 contributes 60% of total score
  THEORY_WEIGHT: 0.4, // Section 2 contributes 40% of total score
};

// ================= START ASSESSMENT =================
exports.startAssessment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { applicationId } = req.params;
    const candidateId = req.candidate.id;

    const application = await Application.findOne({
      where: { id: applicationId, candidate_id: candidateId },
      include: [{ model: Job }]
    });

    if (!application) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Application not found' });
    }

    const job = application.Job;
    const mappedRole = job.title.toUpperCase().replace(/[\s\-\/]+/g, '_');
    logger.info(`[Assessment] Mapped role: ${mappedRole} for job: ${job.title}`);

    // Check existing attempt
    let attempt = await AssessmentAttempt.findOne({ 
      where: { application_id: applicationId },
      transaction 
    });

    if (attempt && attempt.status !== 'IN_PROGRESS') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Assessment already completed and cannot be restarted' });
    }
    if (attempt && attempt.status === 'IN_PROGRESS') {
      // Resume existing attempt — return the SAME questions that were originally assigned
      const storedMcqIds = attempt.metadata?.mcq_ids || [];
      const storedTheoryIds = attempt.metadata?.theory_ids || [];

      const storedMcqQuestions = storedMcqIds.length > 0
        ? await TechnicalQuestionBank.findAll({ where: { questionId: { [Op.in]: storedMcqIds } }, transaction })
        : [];
      const storedTheoryQuestions = storedTheoryIds.length > 0
        ? await TechnicalQuestionBank.findAll({ where: { questionId: { [Op.in]: storedTheoryIds } }, transaction })
        : [];

      await transaction.commit();

      const formatQuestion = (q, section) => ({
        id: q.questionId,
        question: q.question,
        options: q.options || [],
        type: q.questionType || q.section_type,
        topic: q.topic,
        difficulty: q.difficulty || 'MEDIUM',
        weight: q.weight || 1,
        section,
        evaluation_type: q.evaluation_type || (q.section_type === 'MCQ' ? 'MCQ' : 'AI')
      });

      return res.json({
        success: true,
        attempt_id: attempt.id,
        resumed: true,
        config: {
          section1_duration: ASSESSMENT_CONFIG.SECTION1_DURATION_MINUTES,
          section2_duration: ASSESSMENT_CONFIG.SECTION2_DURATION_MINUTES,
          total_duration: ASSESSMENT_CONFIG.TOTAL_DURATION_MINUTES,
          mcq_count: storedMcqQuestions.length,
          theory_count: storedTheoryQuestions.length,
        },
        section1: storedMcqQuestions.map(q => formatQuestion(q, 1)),
        section2: storedTheoryQuestions.map(q => formatQuestion(q, 2)),
        started_at: attempt.started_at,
        answers: attempt.answers || {},
      });
    }

    // --- SECTION 1: Fetch 20 MCQ questions ---
    let mcqPool = await TechnicalQuestionBank.findAll({
      where: {
        [Op.or]: [{ jobRole: mappedRole }, { job_id: job.id }],
        isActive: true,
        section_type: 'MCQ'
      },
      order: sequelize.random(),
      limit: ASSESSMENT_CONFIG.SECTION1_MCQ_COUNT,
      transaction
    });

    // Fallback: try partial match if exact role not found
    if (mcqPool.length < ASSESSMENT_CONFIG.SECTION1_MCQ_COUNT) {
      const fallback = await TechnicalQuestionBank.findAll({
        where: { isActive: true, section_type: 'MCQ' },
        order: sequelize.random(),
        limit: ASSESSMENT_CONFIG.SECTION1_MCQ_COUNT,
        transaction
      });
      const existingIds = new Set(mcqPool.map(q => q.questionId));
      fallback.forEach(q => { if (!existingIds.has(q.questionId)) mcqPool.push(q); });
      mcqPool = mcqPool.slice(0, ASSESSMENT_CONFIG.SECTION1_MCQ_COUNT);
    }

    // --- SECTION 2: Fetch 5 Theory/Scenario/Behavioral questions ---
    let theoryPool = await TechnicalQuestionBank.findAll({
      where: {
        [Op.or]: [{ jobRole: mappedRole }, { job_id: job.id }],
        isActive: true,
        section_type: 'SECTION_2'
      },
      order: sequelize.random(),
      limit: ASSESSMENT_CONFIG.SECTION2_THEORY_COUNT,
      transaction
    });

    if (theoryPool.length < ASSESSMENT_CONFIG.SECTION2_THEORY_COUNT) {
      const fallback = await TechnicalQuestionBank.findAll({
        where: {
          isActive: true,
          section_type: 'SECTION_2',
          questionId: { [Op.notIn]: theoryPool.map(q => q.questionId) }
        },
        order: sequelize.random(),
        limit: ASSESSMENT_CONFIG.SECTION2_THEORY_COUNT,
        transaction
      });
      const existingIds = new Set(theoryPool.map(q => q.questionId));
      fallback.forEach(q => { if (!existingIds.has(q.questionId)) theoryPool.push(q); });
      theoryPool = theoryPool.slice(0, ASSESSMENT_CONFIG.SECTION2_THEORY_COUNT);
    }

    // Combine question IDs for attempt metadata
    const mcqIds = mcqPool.map(q => q.questionId);
    const theoryIds = theoryPool.map(q => q.questionId);
    const allIds = [...mcqIds, ...theoryIds];

    const attemptData = {
      application_id: application.id,
      candidate_id: candidateId,
      assessment_type: 'TECHNICAL',
      status: 'IN_PROGRESS',
      started_at: new Date(),
      metadata: {
        question_ids: allIds,
        mcq_ids: mcqIds,
        theory_ids: theoryIds,
        config: ASSESSMENT_CONFIG,
        job_title: job.title,
        mapped_role: mappedRole
      },
      answers: {},
      ip_address: req.ip || req.connection?.remoteAddress,
      device_info: { userAgent: req.headers['user-agent'] }
    };

    attempt = await AssessmentAttempt.create(attemptData, { transaction });

    await application.update({ status: 'TECHNICAL_ROUND_IN_PROGRESS' }, { transaction });
    await ApplicationStatusLog.create({
      application_id: applicationId,
      previous_status: application.status,
      new_status: 'TECHNICAL_ROUND_IN_PROGRESS',
      changed_by: candidateId
    }, { transaction });

    await transaction.commit();

    const formatQuestion = (q, section) => ({
      id: q.questionId,
      question: q.question,
      options: q.options || [],
      type: q.questionType || q.section_type,
      topic: q.topic,
      difficulty: q.difficulty || 'MEDIUM',
      weight: q.weight || 1,
      section,
      evaluation_type: q.evaluation_type || (q.section_type === 'MCQ' ? 'MCQ' : 'AI')
    });

    res.json({
      success: true,
      attempt_id: attempt.id,
      config: {
        section1_duration: ASSESSMENT_CONFIG.SECTION1_DURATION_MINUTES,
        section2_duration: ASSESSMENT_CONFIG.SECTION2_DURATION_MINUTES,
        total_duration: ASSESSMENT_CONFIG.TOTAL_DURATION_MINUTES,
        mcq_count: mcqPool.length,
        theory_count: theoryPool.length,
      },
      section1: mcqPool.map(q => formatQuestion(q, 1)),
      section2: theoryPool.map(q => formatQuestion(q, 2)),
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('Error starting assessment:', error);
    res.status(500).json({ error: 'Failed to start assessment', details: error.message });
  }
};

// ================= SAVE ANSWER (single) =================
exports.saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { question_id, answer_text, section } = req.body;

    const attempt = await AssessmentAttempt.findByPk(attemptId, { include: [{ model: Application }] });
    if (!attempt || attempt.status !== 'IN_PROGRESS' || attempt.Application.candidate_id !== req.candidate.id) {
      return res.status(404).json({ message: "Invalid or unauthorized attempt" });
    }

    // Enforce Timer
    const timeLimitMinutes = attempt.metadata?.config?.TOTAL_DURATION_MINUTES || ASSESSMENT_CONFIG.TOTAL_DURATION_MINUTES;
    const timeLimitMs = (timeLimitMinutes + 2) * 60 * 1000; // 2 minutes grace period
    const timeTakenMs = new Date() - new Date(attempt.started_at);
    if (timeTakenMs > timeLimitMs) {
      // Auto-submit if time exceeded
      await attempt.update({ status: 'SUBMITTED', submitted_at: new Date() });
      return res.status(400).json({ error: 'Assessment time limit exceeded. Exam auto-submitted.' });
    }

    const currentAnswers = attempt.answers || {};
    currentAnswers[question_id] = { answer_text, section: section || 1, timestamp: new Date() };

    await AssessmentAttempt.update({ answers: currentAnswers, updated_at: new Date() }, { where: { id: attemptId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save' });
  }
};

// ================= SAVE ALL ANSWERS (bulk) =================
exports.saveAllAnswers = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body; // { [questionId]: { answer_text, section } }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object required' });
    }

    const transaction = await sequelize.transaction();
    try {
      const attempt = await AssessmentAttempt.findByPk(attemptId, { 
        include: [{ model: Application }],
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      if (!attempt || attempt.status !== 'IN_PROGRESS' || attempt.Application.candidate_id !== req.candidate.id) {
        await transaction.rollback();
        return res.status(404).json({ message: "Invalid or unauthorized attempt" });
      }

      // Enforce Timer
      const timeLimitMinutes = attempt.metadata?.config?.TOTAL_DURATION_MINUTES || ASSESSMENT_CONFIG.TOTAL_DURATION_MINUTES;
      const timeLimitMs = (timeLimitMinutes + 2) * 60 * 1000; // 2 minutes grace period
      const timeTakenMs = new Date() - new Date(attempt.started_at);
      if (timeTakenMs > timeLimitMs) {
        await attempt.update({ status: 'SUBMITTED', submitted_at: new Date() }, { transaction });
        await transaction.commit();
        return res.status(400).json({ error: 'Assessment time limit exceeded. Exam auto-submitted.' });
      }

      // Merge with existing answers (don't overwrite answers from other section)
      const existing = attempt.answers || {};
      const merged = { ...existing };
      Object.keys(answers).forEach(qId => {
        merged[qId] = {
          answer_text: answers[qId]?.answer_text || answers[qId] || '',
          section: answers[qId]?.section || 1,
          timestamp: new Date()
        };
      });

      await attempt.update({ answers: merged, updated_at: new Date() }, { transaction });
      await transaction.commit();
      logger.info(`[BulkSave] Saved ${Object.keys(answers).length} answers for attempt ${attemptId}`);
      res.json({ success: true, saved: Object.keys(merged).length });
    } catch (txError) {
      if (transaction) await transaction.rollback();
      throw txError;
    }
  } catch (error) {
    logger.error('Bulk save error:', error);
    res.status(500).json({ error: 'Failed to save answers' });
  }
};

// ================= SUBMIT ASSESSMENT =================
exports.submitAssessment = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const candidateId = req.candidate.id;

    const attempt = await AssessmentAttempt.findByPk(attemptId, { include: [{ model: Application }] });
    if (!attempt || attempt.status !== 'IN_PROGRESS' || attempt.Application.candidate_id !== candidateId) {
      return res.status(404).json({ error: 'Invalid or unauthorized attempt' });
    }

    // Enforce Timer on Submit
    const timeLimitMinutes = attempt.metadata?.config?.TOTAL_DURATION_MINUTES || ASSESSMENT_CONFIG.TOTAL_DURATION_MINUTES;
    const timeLimitMs = (timeLimitMinutes + 2) * 60 * 1000;
    const timeTakenMs = new Date() - new Date(attempt.started_at);
    
    // We update the submitted_at time. Even if they are late, we process the submission 
    // but the saveAnswer route will have rejected any late answers.
    if (timeTakenMs > timeLimitMs) {
      logger.warn(`Attempt ${attemptId} submitted late (${timeTakenMs}ms). Time limit was ${timeLimitMs}ms.`);
    }

    const transaction = await sequelize.transaction();
    try {
      await attempt.update({ status: 'SUBMITTED', submitted_at: new Date() }, { transaction });

      const application = attempt.Application;
      await application.update({ status: 'TECHNICAL_ROUND_COMPLETED' }, { transaction });
      await ApplicationStatusLog.create({
        application_id: application.id,
        previous_status: 'TECHNICAL_ROUND_IN_PROGRESS',
        new_status: 'TECHNICAL_ROUND_COMPLETED',
        changed_by: candidateId,
        reason: 'Candidate submitted assessment'
      }, { transaction });
      
      await transaction.commit();
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }

    res.json({ success: true, message: "Assessment submitted. AI analysis running in background." });

    // Async auto-analysis moved to background worker (src/workers/assessment.worker.js)

  } catch (error) {
    logger.error('Submit error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
};

// ================= ANALYZE ASSESSMENT =================
exports.analyzeAssessment = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const attempt = await AssessmentAttempt.findOne({
      where: { application_id: applicationId },
      order: [['created_at', 'DESC']],
      include: [{ model: Application, include: [Job] }]
    });

    if (!attempt) return res.status(404).json({ error: 'No assessment attempt found' });
    if (attempt.status === 'EVALUATED') return res.status(200).json({ success: true, score: attempt.final_score });

    const storedAnswers = attempt.answers || {};
    const allIds = attempt.metadata?.question_ids || [];
    const mcqIds = attempt.metadata?.mcq_ids || [];
    const theoryIds = attempt.metadata?.theory_ids || [];

    const questions = await TechnicalQuestionBank.findAll({
      where: { questionId: { [Op.in]: allIds } },
      attributes: ['questionId', 'question', 'options', 'difficulty', 'questionType', 'topic',
                   'correct_answer', 'weight', 'section_type', 'expected_answer', 'evaluation_type', 'keywords']
    });

    let mcqTotal = 0, mcqWeight = 0;
    let theoryTotal = 0, theoryWeight = 0;
    let avgStructure = 0, avgCoverage = 0, theoryCount = 0;
    const allStrengths = [], allWeaknesses = [];

    for (const q of questions) {
      const ansData = storedAnswers[q.questionId];
      const answerText = ansData?.answer_text || '';
      const w = q.weight || 1;
      const isMCQ = q.section_type === 'MCQ' || mcqIds.includes(q.questionId);

      let score = 0;
      if (isMCQ) {
        // MCQ: exact match
        score = (answerText.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase()) ? 100 : 0;
        mcqTotal += score * w;
        mcqWeight += w;
      } else {
        // Theory: AI + ML hybrid
        let mlScore = 0, aiScore = 0;
        try {
          mlScore = Math.round(scoringService.calculateCosineSimilarity(answerText, q.expected_answer || q.question) * 100);
        } catch (_) {}

        try {
          const aiRes = await aiService.evaluateTechnicalAnswer(q.question, answerText, q.expected_answer, q.keywords);
          aiScore = aiRes.score || 0;
          avgStructure += aiRes.structure_score || 0;
          avgCoverage += aiRes.concept_coverage || 0;
          theoryCount++;
          if (aiRes.strengths) allStrengths.push(...aiRes.strengths);
          if (aiRes.weaknesses) allWeaknesses.push(...aiRes.weaknesses);
        } catch (_) {
          aiScore = mlScore;
        }

        score = Math.round((aiScore * 0.7) + (mlScore * 0.3));
        theoryTotal += score * w;
        theoryWeight += w;
      }
    }

    const mcqScore = mcqWeight > 0 ? Math.round(mcqTotal / mcqWeight) : 0;
    const theoryScore = theoryWeight > 0 ? Math.round(theoryTotal / theoryWeight) : 0;
    let finalScore = 0;
    if (mcqWeight > 0 && theoryWeight > 0) {
      finalScore = Math.round((mcqScore * ASSESSMENT_CONFIG.MCQ_WEIGHT) + (theoryScore * ASSESSMENT_CONFIG.THEORY_WEIGHT));
    } else if (mcqWeight > 0 && theoryWeight === 0) {
      finalScore = mcqScore; // Re-weight MCQ to 100%
      logger.warn(`Role's question bank is incomplete: missing Theory questions for application ${applicationId}`);
    } else if (theoryWeight > 0 && mcqWeight === 0) {
      finalScore = theoryScore; // Re-weight Theory to 100%
      logger.warn(`Role's question bank is incomplete: missing MCQ questions for application ${applicationId}`);
    }

    const structureAvg = theoryCount > 0 ? avgStructure / theoryCount : 0;
    const coverageAvg = theoryCount > 0 ? avgCoverage / theoryCount : 0;


    const application = attempt.Application;
    const tx = await sequelize.transaction();
    try {
      await attempt.update({
        answers: storedAnswers,
        ai_score: theoryScore,
        ml_score: mcqScore,
        final_score: finalScore,
        score: finalScore,
        status: 'EVALUATED',
        structure_score: structureAvg,
        concept_coverage: coverageAvg,
        ai_feedback: `MCQ Section: ${mcqScore}% | Theory Section: ${theoryScore}% | Final: ${finalScore}%`
      }, { transaction: tx });

      await application.update({ technical_score: finalScore }, { transaction: tx });

      await AssessmentAnalysis.destroy({ where: { application_id: application.id }, transaction: tx });
      await AssessmentAnalysis.create({
        application_id: application.id,
        overall_score: finalScore,
        correctness_score: mcqScore,
        assessment_type: 'TECHNICAL',
        test_name: `${application.Job?.title || 'Role'} — Technical Assessment`,
        strengths: Array.from(new Set([...allStrengths, `MCQ Score: ${mcqScore}%`, `Theory Score: ${theoryScore}%`])).slice(0, 6),
        weaknesses: Array.from(new Set(allWeaknesses)).slice(0, 6),
        detailed_feedback: `**Assessment Complete**\n\nSection 1 (MCQ): ${mcqScore}%\nSection 2 (Theory): ${theoryScore}%\nWeighted Final Score: ${finalScore}%\n\nMCQ evaluates core technical knowledge. Theory questions evaluate applied thinking and role-specific problem solving.`,
        estimated_skill_level: finalScore >= 75 ? 'ADVANCED' : finalScore >= 50 ? 'INTERMEDIATE' : 'BEGINNER'
      }, { transaction: tx });

      await tx.commit();
    } catch (txErr) {
      await tx.rollback();
      throw txErr;
    }

    if (res?.json) res.json({ success: true, score: finalScore, mcq_score: mcqScore, theory_score: theoryScore });

  } catch (error) {
    logger.error('Analysis error:', error);
    if (res?.status) res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
};

// ================= LOG MALPRACTICE =================
exports.logMalpractice = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { type, severity, metadata } = req.body;

    const attempt = await AssessmentAttempt.findByPk(attemptId);
    if (!attempt || attempt.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Invalid' });

    const penaltyMap = { TAB_SWITCH: 5, FULLSCREEN_EXIT: 10, COPY_ATTEMPT: 3, WINDOW_BLUR: 2 };
    // Ignore the request body's severity to prevent candidates from passing negative numbers or reducing penalty
    const penalty = penaltyMap[type] || 2; 

    await attempt.update({
      malpractice_score: (attempt.malpractice_score || 0) + penalty,
      anti_cheating_data: [...(attempt.anti_cheating_data || []), { type, penalty, timestamp: new Date(), metadata }]
    });

    await MalpracticeEvent.create({ application_id: attempt.application_id, type, severity: penalty, meta: metadata });
    res.json({ success: true });
  } catch (_) {
    res.status(500).json({ error: 'Failed' });
  }
};

exports.getAssessmentConfig = async (req, res) => res.json(ASSESSMENT_CONFIG);

exports.getAssessmentStatus = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await AssessmentAttempt.findByPk(attemptId, { include: [{ model: Application }] });
    if (!attempt || attempt.Application.candidate_id !== req.candidate.id) {
      return res.status(404).json({ error: 'Not found or unauthorized' });
    }
    res.json({ status: attempt.status, started_at: attempt.started_at });
  } catch (_) {
    res.status(500).json({ error: 'Failed' });
  }
};
