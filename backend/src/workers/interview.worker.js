const { InterviewSession, Application, Job, NotificationQueue } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const aiService = require('../services/ai.service');

class InterviewWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start() {
    logger.info("🚀 Interview Worker started");
    // Run every 30 seconds
    this.intervalId = setInterval(() => this.processPendingInterviews(), 30000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async processPendingInterviews() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const sessions = await InterviewSession.findAll({
        where: { status: 'EVALUATION_PENDING' },
        limit: 5,
        order: [['created_at', 'ASC']],
        include: [{ model: Application, include: [Job] }]
      });

      for (const session of sessions) {
        // Claim the session
        const [updatedRows] = await InterviewSession.update(
          { status: 'PROCESSING' },
          { where: { id: session.id, status: 'EVALUATION_PENDING' } }
        );

        if (updatedRows === 0) continue;

        logger.info(`[Interview Worker] Processing session ${session.id} for Application ${session.Application.id}`);
        
        let interviewScore = 0;
        let aiAnalysis = null;
        const questionsAsked = session.questions_asked || [];

        try {
          const qaPairs = questionsAsked.map(q => ({
            question: q.question_text,
            answer: q.response_text,
            duration: q.response_duration_seconds
          }));
   
          aiAnalysis = await aiService.analyzeFullInterview(qaPairs, session.Application.Job?.title);
          interviewScore = aiAnalysis.overall_interview_score || 0;
        } catch (aiErr) {
          logger.error(`[Interview Worker AI Error] Session ${session.id}: ${aiErr.message}`);
          interviewScore = 0; // Fallback
        }

        try {
          await InterviewSession.update({
            status: 'COMPLETED',
            ended_at: new Date(),
            overall_score: interviewScore,
            dimension_scores: aiAnalysis?.dimension_scores || {},
            highlights: aiAnalysis?.highlights || [],
            hire_recommendation: aiAnalysis?.recommendation?.toUpperCase().replace(/\s+/g, '_') || 'MAYBE'
          });
   
          await session.Application.update({
            status: 'INTERVIEW_COMPLETED',
            interview_score: Math.round(interviewScore),
            updated_at: new Date()
          });
   
          logger.info(`[Interview Worker] Score: ${interviewScore}, Analysis Persisted.`);
        } catch (dbErr) {
          logger.error(`[Interview Worker DB Error]: ${dbErr.message}`);
        }
   
        // Auto-rejection engine
        try {
          const { checkAndTriggerAutoRejection } = require('../controllers/application.controller');
          await checkAndTriggerAutoRejection(session.Application.id, logger);
        } catch (autoErr) {
          logger.warn(`[Interview Worker Auto-Rejection] check failed: ${autoErr.message}`);
        }
      }

    } catch (error) {
      logger.error("[Interview Worker] Error during processing:", error);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new InterviewWorker();
