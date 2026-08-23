const express = require("express");
const router = express.Router();
const multer = require("multer");
const auth = require("../middleware/auth.middleware");
const resumeController = require("../controllers/resume.controller");

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/resumes/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Sanitize the filename to prevent directory traversal
    const parsed = path.parse(file.originalname);
    const safeName = parsed.name.replace(/[^a-zA-Z0-9]/g, "");
    const safeExt = parsed.ext.replace(/[^a-zA-Z0-9.]/g, "");
    const uniqueSuffix = crypto.randomUUID();
    cb(null, `${uniqueSuffix}-${safeName}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF and Word documents are allowed."), false);
  }
};

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter 
});

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
  resumeController.reparseResume
);

module.exports = router;