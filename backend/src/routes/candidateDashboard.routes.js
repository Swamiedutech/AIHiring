const express = require("express");
const {
  getDashboardOverview,
  getApplicationDetails,
  getNextAction,
  updateCandidateProfile,
  autofillFromResume
} = require("../controllers/candidateDashboard.controller");

const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

const { uploadResume } = require("../controllers/resume.controller");
const upload = require("../middleware/upload.middleware");
const { uploadProfileImage: uploadProfileImageController } = require("../controllers/profileImage.controller");

const router = express.Router();

// 🔐 Protect all candidate routes
router.use(authMiddleware);
router.use(roleMiddleware(["CANDIDATE", "HR", "ADMIN"]));

/**
 * @route   GET /dashboard/candidate/overview
 */
router.get("/overview", getDashboardOverview);

/**
 * @route   GET /dashboard/candidate/application/:applicationId
 */
router.get("/application/:applicationId", getApplicationDetails);


/**
 * @route   GET /dashboard/candidate/application/:applicationId/next-action
 */
router.get("/application/:applicationId/next-action", getNextAction);

/**
 * @route   PUT /dashboard/candidate/profile
 */
router.put("/profile", updateCandidateProfile);

router.post(
  "/resume/upload",
  upload.single("resume"),
  uploadResume
);

router.post("/resume/autofill", autofillFromResume);

router.post(
  "/profile-image/upload",
  upload.single("profile_image"),
  uploadProfileImageController
);


module.exports = router;