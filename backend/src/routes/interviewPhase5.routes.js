/**
 * Interview Routes - Phase 5
 * AI-powered video interviews with sentiment analysis
 */

const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewPhase5.controller');
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const multer = require('multer');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/interviews/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '')}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error("Only video and audio files are allowed"));
    }
  }
});

// ==================== CANDIDATE ROUTES ====================

/**
 * Get Interview Config
 * GET /interview/config
 * Private: Candidate only
 */
router.get('/config', authMiddleware, interviewController.getInterviewConfig);

/**
 * Start Interview
 * GET /interview/application/:applicationId/start
 * Private: Candidate only
 */
router.post(
  '/application/:applicationId/start',
  authMiddleware,
  roleMiddleware(['CANDIDATE']),
  interviewController.startInterviewPhase5
);

/**
 * Get Interview Status
 * GET /interview/:sessionId/status
 * Private: Candidate only
 */
router.get(
  '/:sessionId/status',
  authMiddleware,
  roleMiddleware(['CANDIDATE']),
  interviewController.getInterviewStatusPhase5
);

router.get(
  '/application/:applicationId/status',
  authMiddleware,
  roleMiddleware(['CANDIDATE']),
  interviewController.getInterviewStatusByApplicationId
);

/**
 * Submit Interview Response
 * POST /interview/:sessionId/response
 * Private: Candidate only
 * Body: { question_id, video_blob, transcription, response_duration_seconds, question_number }
 */
router.post(
  '/:sessionId/response',
  authMiddleware,
  roleMiddleware(['CANDIDATE']),
  upload.single("video_blob"),
  interviewController.submitResponsePhase5
);

// ==================== HR/ADMIN ROUTES ====================

/**
 * Schedule Interview
 * POST /interview/schedule/application/:applicationId
 * Private: HR/Admin only
 * Body: { scheduled_date, scheduled_time, interview_type }
 */
router.post(
  '/schedule/application/:applicationId',
  authMiddleware,
  roleMiddleware(['HR', 'ADMIN']),
  interviewController.scheduleInterviewPhase5
);

/**
 * Get Interview Results
 * GET /interview/application/:applicationId/results
 * Private: HR/Admin only
 */
router.get(
  '/application/:applicationId/results',
  authMiddleware,
  roleMiddleware(['HR', 'ADMIN']),
  interviewController.getInterviewResultsPhase5
);

/**
 * Get AI Interview Analysis (6-dimension scoring)
 * GET /interview/application/:applicationId/analysis
 * Private: HR, ADMIN, MD
 */
router.get(
  '/application/:applicationId/analysis',
  authMiddleware,
  roleMiddleware(['HR', 'ADMIN', 'MD']),
  interviewController.getInterviewAnalysis
);

module.exports = router;
