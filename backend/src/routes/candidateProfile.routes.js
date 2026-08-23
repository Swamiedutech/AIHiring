const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");
const CandidateProfileController = require("../controllers/candidateProfile.controller");

// 🔥 HR 360 Candidate Profile
router.get(
  "/profile/:applicationId",
  auth,
  authorize(["HR", "ADMIN", "MD"]),
  CandidateProfileController.getCandidateProfile
);

// 🔥 HR Pipeline (Kanban)
router.get(
  "/pipeline",
  auth,
  authorize(["HR", "ADMIN", "MD"]),
  CandidateProfileController.getPipelineCandidates
);

module.exports = router;