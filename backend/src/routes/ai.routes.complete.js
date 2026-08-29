const express = require('express');
const upload = require('../middleware/upload.middleware');
const aiController = require('../controllers/ai.controller.complete');
const isAuthenticated = require('../middleware/auth.middleware');
const { authorize, auditLog } = require('../middleware/rbac.middleware');

const router = express.Router();

// ==================== HEALTH & METADATA ====================

/**
 * Health check - no auth required
 */
router.get('/health', aiController.healthCheck);

// ==================== RESUME OPERATIONS ====================

/**
 * Parse and analyze resume with AI
 * POST /api/ai/resume/parse
 * Body: { applicationId, jobId? }
 * File: resume PDF/DOCX
 */
router.post(
  '/resume/parse',
  isAuthenticated,
  authorize(['candidate', 'hr', 'admin']),
  auditLog('RESUME_PARSE'),
  upload.single('file'),
  aiController.parseResumeWithAI
);

/**
 * Re-parse and re-evaluate resume
 * POST /api/ai/resume/reparse/:applicationId
 */
router.post(
  '/resume/reparse/:applicationId',
  isAuthenticated,
  authorize(['hr', 'admin']),
  auditLog('RESUME_REPARSE'),
  aiController.reparseResume
);

// ==================== ASSESSMENT OPERATIONS ====================

/**
 * Analyze coding solution
 * POST /api/ai/assessment/coding
 * Body: { applicationId, code, problemDescription, testName? }
 */
router.post(
  '/assessment/coding',
  isAuthenticated,
  authorize(['candidate', 'hr', 'admin']),
  auditLog('CODING_ANALYSIS'),
  aiController.analyzeCodingAssessment
);

/**
 * Analyze MCQ test responses
 * POST /api/ai/assessment/mcq
 * Body: { applicationId, questions, answers, testName? }
 */
router.post(
  '/assessment/mcq',
  isAuthenticated,
  authorize(['hr', 'admin']),
  auditLog('MCQ_ANALYSIS'),
  aiController.analyzeMCQAssessment
);

// Note: System design and case study routes removed - use analyzeMCQAssessment for all assessments
/**
 * Re-evaluate an existing assessment
 * POST /api/ai/re-evaluate
 * Body: { applicationId }
 */
router.post(
  '/re-evaluate',
  isAuthenticated,
  authorize(['hr', 'admin']),
  auditLog('ASSESSMENT_RE_EVALUATE'),
  aiController.reEvaluateAssessment
);

// ==================== INTERVIEW OPERATIONS ====================

/**
 * Analyze interview session
 * POST /api/ai/interview/analyze
 * Body: { applicationId, transcript, questions?, interviewType? }
 */
router.post(
  '/interview/analyze',
  isAuthenticated,
  authorize(['hr', 'md', 'admin']),
  auditLog('INTERVIEW_ANALYSIS'),
  aiController.analyzeInterview
);

// ==================== AI DECISION ENGINE ====================

/**
 * Make final AI decision (with auto-rejection)
 * POST /api/ai/decision/make
 * Body: { applicationId, jobId? }
 * 
 * Calculates final score and determines:
 * - AUTO_REJECTED (score < 40)
 * - PROCEED_TO_HR (40-60)
 * - RECOMMENDED (60+)
 * 
 * RBAC: HR, MD, Admin - they can trigger final decision
 */
router.post(
  '/decision/make',
  isAuthenticated,
  authorize(['hr', 'md', 'admin']),
  auditLog('FINAL_DECISION'),
  aiController.makeFinalAIDecision
);

// ==================== ANALYSIS RETRIEVAL (HR/MD ONLY) ====================

/**
 * Get complete AI analysis for application
 * GET /api/ai/analysis/:applicationId
 * Returns: resume, assessment, interview, decision analyses
 * 
 * RBAC: HR, MD, Admin only (candidates blocked)
 */
router.get(
  '/analysis/:applicationId',
  isAuthenticated,
  authorize(['hr', 'md', 'admin']),
  auditLog('VIEW_ANALYSIS'),
  aiController.getAIAnalysis
);

// ==================== ANALYTICS ENDPOINTS ====================

/**
 * Get AI analytics dashboard data
 * GET /api/ai/analytics?jobId=X&departmentId=Y&skillLevel=Z
 * Returns: stats, candidates list, score distribution, decision breakdown, skill distribution
 * 
 * RBAC: HR, MD, Admin only
 */
router.get(
  '/analytics',
  isAuthenticated,
  authorize(['hr', 'md', 'admin']),
  auditLog('VIEW_ANALYTICS'),
  aiController.getAIAnalytics
);

/**
 * Export analytics data to CSV
 * POST /api/ai/analytics/export
 * Body: { jobId?, departmentId?, skillLevel? }
 * Returns: CSV file download
 * 
 * RBAC: HR, MD, Admin only
 */
router.post(
  '/analytics/export',
  isAuthenticated,
  authorize(['hr', 'md', 'admin']),
  auditLog('EXPORT_ANALYTICS'),
  aiController.exportAIAnalytics
);

// ==================== CANDIDATE CHATBOT ====================

/**
 * Direct AI Chat
 * POST /api/ai/chat
 */
router.post(
  '/chat',
  isAuthenticated,
  authorize(['candidate', 'hr', 'admin']),
  aiController.chatWithAI
);

// ==================== ERROR HANDLING ====================

/**
 * 404 handler for AI routes
 */
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'AI endpoint not found',
    path: req.path,
    method: req.method,
    code: 'ENDPOINT_NOT_FOUND',
  });
});

module.exports = router;
