const jwt = require("jsonwebtoken");
const { User, Candidate, CandidateSession } = require("../models");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    if (decoded.token_version !== user.auth_token_revision) {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    // 🔥 Candidate Session Validation (SAFE VERSION)
    if (user.role === "CANDIDATE") {
      const candidate = await Candidate.findOne({
        where: { user_id: user.id },
      });

      if (!candidate) {
        return res
          .status(401)
          .json({ message: "Candidate profile not found" });
      }

      const session = await CandidateSession.findOne({
        where: {
          candidate_id: candidate.id,
          session_token: token,
          is_active: true,
        },
      });

      // 🔥 FIX: Enable session validation for security
      if (!session) {
        console.warn(
          "⚠️ Session not found for candidate:",
          candidate.id
        );
        return res.status(401).json({
          message: "Session expired. Please login again."
        });
      } else {
        // Update last activity timestamp
        await session.update({
          last_activity_at: new Date(),
        });
      }

      req.candidate = candidate;
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("❌ AUTH ERROR:", error.message);
    return res
      .status(401)
      .json({ message: "Invalid or expired token" });
  }
};