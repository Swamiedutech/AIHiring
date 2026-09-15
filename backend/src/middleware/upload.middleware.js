const multer = require("multer");
const path = require("path");

const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dir = "uploads/resumes";
    if (file.fieldname === "profile_image") {
      dir = "uploads/profile-images";
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (file.fieldname === "profile_image") {
    const allowedTypes = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    if (allowedTypes.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error("Only image files are allowed"));
  } else {
    const allowedTypes = [".pdf", ".doc", ".docx"];
    if (allowedTypes.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error("Only PDF/DOC/DOCX allowed"));
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});