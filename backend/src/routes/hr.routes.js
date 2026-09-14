const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const role = require("../middleware/role.middleware");

const {
  getAllApplications,
  updateDecision,
  getDashboardSummary,
  sendOfferLetter,
  sendRejectionEmail,
  scheduleInterview,
  addInternalNote,
  getAssessmentStats,
  getAssessmentsList,
  getAssessmentDetails,
  getInterviewStats,
  getInterviewsList,
  getInterviewDetails,
  getReadyForInterview,
  updateApplicationStatus,
  getResume
} = require("../controllers/hr.controller");

const HRDashboardController = require("../controllers/hrDashboard.controller");
const CandidateProfileController = require("../controllers/candidateProfile.controller");
const HRDecisionController = require("../controllers/hrDecision.controller");
const RiskMonitorController = require("../controllers/riskMonitor.controller");
const { getNotifications } = require("../controllers/notification.controller");
const ReportController = require("../controllers/report.controller");
const fs = require("fs");
const { Job } = require("../models");


// ===============================
// CORE RESOURCES (HR/ADMIN)
// ===============================

router.get(
  "/jobs",
  auth,
  role(["HR", "ADMIN", "MD"]),
  async (req, res) => {
    try {
      const jobs = await Job.findAll({ order: [["title", "ASC"]] });
      res.json({ success: true, data: jobs });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get(
  "/applications",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getAllApplications
);

router.post(
  "/decision",
  auth,
  role(["HR", "ADMIN", "MD"]),
  updateDecision
);

router.get(
  "/dashboard",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getDashboardSummary
);

router.get(
  "/notifications",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getNotifications
);


// ===============================
// HR DASHBOARD ROUTES
// ===============================

router.get(
  "/dashboard/kpi",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getKPICards
);

router.get(
  "/dashboard/funnel",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getHiringFunnel
);

router.get(
  "/dashboard/recent-hires",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getRecentHires
);

router.get(
  "/dashboard/distribution",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getStatusDistribution
);

router.get(
  "/dashboard/skills-heatmap",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getSkillGap            // ✅ was: getSkillGapHeatmap (didn't exist)
);

router.get(
  "/dashboard/pending-actions",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getPendingActions
);

router.get(
  "/dashboard/ai-vs-hr",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getAIvsHRComparison
);

router.get(
  "/dashboard/overview",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getDashboardOverview
);

router.get(
  "/dashboard/time-to-hire",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getTimeToHirePerRole
);

router.get(
  "/dashboard/rejection-reasons",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getRejectionReasons
);

router.get(
  "/dashboard/operational-core",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getOperationalCore
);

router.get(
  "/dashboard/top-candidates",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDashboardController.getTopCandidates
);

// MD Decisions feed for HR dashboard
const { getMDDecisions } = require("../controllers/md.controller");
router.get(
  "/dashboard/md-decisions",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getMDDecisions
);

router.get(
  "/assessments/stats",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getAssessmentStats
);

router.get(
  "/assessments/list",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getAssessmentsList
);

router.get(
  "/assessments/:jobId/details",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getAssessmentDetails
);

router.get(
  "/interviews/stats",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getInterviewStats
);

router.get(
  "/interviews/list",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getInterviewsList
);

router.get(
  "/interviews/ready",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getReadyForInterview
);

router.get(
  "/interviews/:id/details",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getInterviewDetails
);


// ===============================
// CANDIDATE 360 PROFILE
// ===============================

router.get(
  "/applications/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  CandidateProfileController.getCandidateProfile
);

router.get(
  "/candidates/:candidateId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  CandidateProfileController.getCandidateById
);

router.get(
  "/pipeline",
  auth,
  role(["HR", "ADMIN", "MD"]),
  CandidateProfileController.getPipelineCandidates
);

router.get(
  "/risk-monitor",
  auth,
  role(["HR", "ADMIN", "MD"]),
  RiskMonitorController.getRiskMonitor
);


// ===============================
// HR DECISION ROUTES
// ===============================

router.post(
  "/decision/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.makeDecision
);

router.get(
  "/approvals/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.getPendingApprovals
);

router.post(
  "/escalate/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.escalateDecision
);

router.post(
  "/request-reinterview/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.requestReInterview
);

router.post(
  "/re-evaluate-assessment/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.reEvaluateAssessment
);

router.get(
  "/approval-rules",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.getApprovalRules
);

router.put(
  "/applications/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  updateApplicationStatus
);

// ===============================
// HR ACTION HANDLERS (NEW)
// ===============================

router.post(
  "/send-offer/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  sendOfferLetter
);

router.post(
  "/send-rejection/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  sendRejectionEmail
);

router.post(
  "/schedule-interview/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  scheduleInterview
);


router.post(
  "/add-note/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  addInternalNote
);

router.get(
  "/report/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.generateCandidateReport
);

router.get(
  "/report/interview/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.generateInterviewReport
);

router.get(
  "/reports/stats",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.getReportStats
);

router.get(
  "/reports/list",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.getReportsList
);

router.get(
  "/reports/recent",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.getRecentDownloads
);

router.post(
  "/reports/:reportId/track",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.trackDownload
);

router.get(
  "/reports/executive/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  ReportController.generateExecutiveReport
);

router.post(
  "/applications/:applicationId/decide",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.triggerAIDecision
);

router.get(
  "/applications/:applicationId/benchmark",
  auth,
  role(["HR", "ADMIN", "MD"]),
  HRDecisionController.getBenchmarkData
);

// ✅ Removed: PUT /approval-rules/:ruleId
// HRDecisionController.updateApprovalRule was removed because HRApprovalRule
// model doesn't exist yet. Re-add this route when you create that model.

// ===============================
// RESUME VIEWER (HR/MD)
// ===============================



router.get(
  "/resume/:applicationId",
  auth,
  role(["HR", "ADMIN", "MD"]),
  getResume
);

module.exports = router;