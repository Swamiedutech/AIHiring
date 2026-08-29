const bcrypt = require("bcryptjs");
const { sendOTPEmail } = require("../services/email.service");
const { User, Candidate, CandidateSession } = require("../models");
const { generateToken, generateRefreshToken } = require("../utils/jwt");
const crypto = require("crypto");


/**
 * Generate device fingerprint from user agent
 */
const generateDeviceFingerprint = (userAgent) => {
  return crypto
    .createHash("sha256")
    .update(userAgent || "unknown")
    .digest("hex");
};

/**
 * CANDIDATE REGISTER (Email + Password)
 */
exports.candidateRegister = async (req, res) => {
  try {
    const { name, email, password, education, specialization, experience_years } = req.body;

    // Validate inputs
    if (!name || !email || !password || !education || !specialization || experience_years === undefined) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "CANDIDATE",
      status: "ACTIVE"
    });

    // Create candidate profile
    const candidate = await Candidate.create({
      user_id: user.id,
      education,
      specialization,
      experience_years,
      email_verified: false
    });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update candidate with OTP
    await candidate.update({
      otp,
      otp_expires_at: otpExpiresAt
    });

    // Send OTP via email
    const emailSent = await sendOTPEmail(email, otp);

    res.status(201).json({
      message: "Registration successful. OTP sent to your email.",
      candidate_id: candidate.id,
      email_sent: emailSent,
      otp_expires_in_minutes: 10
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * VERIFY OTP
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { candidate_id, otp } = req.body;

    if (!candidate_id || !otp) {
      return res.status(400).json({ message: "Candidate ID and OTP required" });
    }

    const candidate = await Candidate.findByPk(candidate_id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Check if OTP is expired
    if (!candidate.otp_expires_at || new Date() > candidate.otp_expires_at) {
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    // Verify OTP
    if (candidate.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    // Mark email as verified
    await candidate.update({
      email_verified: true,
      email_verified_at: new Date(),
      otp: null,
      otp_expires_at: null
    });

    res.json({ message: "Email verified successfully!" });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * RESEND OTP
 */
exports.resendOTP = async (req, res) => {
  try {
    const { candidate_id } = req.body;

    if (!candidate_id) {
      return res.status(400).json({ message: "Candidate ID required" });
    }

    const candidate = await Candidate.findByPk(candidate_id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Generate new OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await candidate.update({
      otp: newOtp,
      otp_expires_at: otpExpiresAt
    });

    // Get user email
    const user = await candidate.getUser();

    // Send OTP
    const emailSent = await sendOTPEmail(user.email, newOtp);

    res.json({
      message: "New OTP sent to your email",
      email_sent: emailSent,
      otp_expires_in_minutes: 10
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * CANDIDATE LOGIN (Email + Password)
 */
exports.candidateLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const userAgent = req.get("user-agent") || "unknown";
    const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Find user
    const user = await User.unscoped().findOne({ where: { email } });
    if (!user || user.role !== "CANDIDATE") {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if email is verified
    const candidate = await Candidate.findOne({ where: { user_id: user.id } });
    if (!candidate?.email_verified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your email first.",
        candidate_id: candidate.id
      });
    }

    // Check for active sessions (anti-cheating: only 1 active session allowed)
    const activeSessions = await CandidateSession.count({
      where: {
        candidate_id: candidate.id,
        is_active: true
      }
    });

    if (activeSessions > 0) {
      return res.status(409).json({
        message: "You already have an active session. Please logout first.",
        hint: "For security reasons, only one active session is allowed per candidate."
      });
    }

    // Generate tokens
    const accessToken = generateToken(
      { id: user.id, candidateId: candidate.id, role: user.role },
      "15m"
    );
    const refreshToken = generateRefreshToken(
      { id: user.id, candidateId: candidate.id, role: user.role }
    );

    // Create session record
    const deviceFingerprint = generateDeviceFingerprint(userAgent);
    const session = await CandidateSession.create({
      candidate_id: candidate.id,
      session_token: accessToken,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_fingerprint: deviceFingerprint,
      is_active: true,
      activity_log: [
        {
          action: "LOGIN",
          timestamp: new Date(),
          ip: ipAddress
        }
      ]
    });

    // Update last login info
    await candidate.update({
      last_login_at: new Date(),
      last_login_ip: ipAddress,
      active_session_count: 1
    });

    res.json({
      message: "Login successful",
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: 900, // 15 minutes
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      candidate: {
        id: candidate.id,
        education: candidate.education,
        specialization: candidate.specialization,
        experience_years: candidate.experience_years
      },
      session_id: session.id
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * REFRESH TOKEN
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // Verify refresh token (would implement JWT verification here)
    // For now, simplified version
    const newAccessToken = generateToken(
      { id: req.user.id, candidateId: req.user.candidateId, role: req.user.role },
      "15m"
    );

    res.json({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: 900
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * CANDIDATE LOGOUT
 */
exports.candidateLogout = async (req, res) => {
  try {
    const candidateId = req.user?.candidateId;
    const sessionId = req.body?.session_id;

    if (!candidateId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Deactivate session
    if (sessionId) {
      await CandidateSession.update(
        { is_active: false, ended_at: new Date() },
        { where: { id: sessionId, candidate_id: candidateId } }
      );
    } else {
      // Deactivate all sessions for this candidate
      await CandidateSession.update(
        { is_active: false, ended_at: new Date() },
        { where: { candidate_id: candidateId } }
      );
    }

    // Update candidate session count
    const activeCount = await CandidateSession.count({
      where: { candidate_id: candidateId, is_active: true }
    });

    await Candidate.update(
      { active_session_count: activeCount },
      { where: { id: candidateId } }
    );

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
