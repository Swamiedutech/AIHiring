const { AssessmentAttempt, Application, Job, TechnicalQuestionBank } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const assessmentController = require('../controllers/assessment.controller');

class AssessmentWorker {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start() {
    logger.info("🚀 Assessment Worker started");
    // Run every 30 seconds
    this.intervalId = setInterval(() => this.processPendingAssessments(), 30000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async processPendingAssessments() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find one attempt that is SUBMITTED
      // We process one at a time per interval to avoid locking issues,
      // but in a real queue we would claim and process multiple.
      const attempts = await AssessmentAttempt.findAll({
        where: { status: 'SUBMITTED' },
        limit: 5,
        order: [['created_at', 'ASC']],
        include: [{ model: Application, attributes: ['id'] }]
      });

      for (const attempt of attempts) {
        // Change status to PROCESSING to "claim" it atomically (or simple update)
        const [updatedRows] = await AssessmentAttempt.update(
          { status: 'PROCESSING' },
          { where: { id: attempt.id, status: 'SUBMITTED' } }
        );

        if (updatedRows === 0) {
          // Another worker might have picked it up
          continue;
        }

        logger.info(`[Assessment Worker] Processing attempt ${attempt.id} for Application ${attempt.Application.id}`);
        
        try {
          // Create mock req/res to reuse the existing controller logic
          const mockReq = { params: { applicationId: attempt.Application.id } };
          const mockRes = { 
            json: (data) => { logger.info(`[Assessment Worker] Result: ${JSON.stringify(data)}`); }, 
            status: (code) => mockRes 
          };
          
          await assessmentController.analyzeAssessment(mockReq, mockRes);
        } catch (err) {
          logger.error(`[Assessment Worker] Failed analysis for attempt ${attempt.id}: ${err.message}`);
          // Rollback status on failure so it can be retried later, or set to ERROR
          await AssessmentAttempt.update({ status: 'ERROR_GRADING' }, { where: { id: attempt.id } });
        }
      }

    } catch (error) {
      logger.error("[Assessment Worker] Error during processing:", error);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new AssessmentWorker();
