const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");

const router = express.Router();

router.get(/.*/, async (req, res) => {
  try {
    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.split(" ")[1] : null);
    
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || user.status !== "ACTIVE" || decoded.token_version !== user.auth_token_revision) {
      return res.status(401).json({ message: "Unauthorized: Invalid session" });
    }

    // Securely resolve the file path and prevent directory traversal
    const requestedPath = req.path;
    // Remove leading slashes (both forward and backslash) to prevent path.resolve from treating it as an absolute path on Windows
    const relativePath = requestedPath.replace(/^[\\\/]+/, '');
    
    // Normalize to prevent directory traversal
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.resolve(__dirname, "../../uploads", safePath);

    // Ensure the resolved path is still within the uploads directory
    const uploadsDir = path.resolve(__dirname, "../../uploads");
    if (!absolutePath.startsWith(uploadsDir)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.sendFile(absolutePath);
  } catch (error) {
    console.error("File serve error:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
});

module.exports = router;
