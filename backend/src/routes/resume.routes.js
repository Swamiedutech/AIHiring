const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");
const resumeController = require("../controllers/resume.controller");
const upload = require("../middleware/upload.middleware");

// POST /api/resume/upload
router.post(
  "/upload",
  auth,
  upload.single("resume"),
  resumeController.uploadResume
);

// POST /api/resume/reparse/:applicationId
router.post(
  "/reparse/:applicationId",
  auth,
  roleMiddleware(["HR", "ADMIN", "MD"]),
  resumeController.reparseResume
);

module.exports = router;