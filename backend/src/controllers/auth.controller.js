const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { User, Candidate, CandidateSession } = require("../models");
const { generateToken } = require("../utils/jwt");
const { sendOTPEmail } = require("../services/email.service");
const auditLogger = require("../services/auditLogger.service");

// ================= HELPERS =================
const sendAuthResponse = (user, token, res, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

// ================= REGISTER =================
// Only these roles can be self-registered. HR/ADMIN/MD must be created via admin panel.
const ALLOWED_REGISTRATION_ROLES = ["CANDIDATE"];

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 🔒 SECURITY: Prevent self-assignment of privileged roles
    const safeRole = ALLOWED_REGISTRATION_ROLES.includes(role) ? role : "CANDIDATE";

    if (role && role !== safeRole) {
      return res.status(403).json({ message: "You can only register as a candidate." });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      // If the user exists but hasn't verified their email, allow them to "re-register"
      // to generate a new OTP and update their password/name.
      if (existingUser.role === "CANDIDATE") {
        const existingCandidate = await Candidate.findOne({ where: { user_id: existingUser.id } });
        if (existingCandidate && !existingCandidate.email_verified) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await existingUser.update({ name, password: hashedPassword });
          
          const otp = crypto.randomInt(100000, 999999).toString();
          await existingCandidate.update({
            otp,
            otp_expires_at: new Date(Date.now() + 10 * 60 * 1000)
          });
          
          try {
            await sendOTPEmail(email, otp);
          } catch (err) {
            console.log(`⚠️ Email sending failed. [DEV MODE] Your OTP is: ${otp}`);
          }
          
          return res.status(201).json({
            message: "Registered successfully. Please verify your email.",
            requiresOTP: true,
            email
          });
        }
      }
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { sequelize } = require('../config/db');

    const tx = await sequelize.transaction();
    try {
      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        role: safeRole
      }, { transaction: tx });

      if (safeRole === "CANDIDATE") {
        const otp = crypto.randomInt(100000, 999999).toString();

        const candidate = await Candidate.create({
          user_id: user.id,
          education: "Not Provided",
          specialization: "Not Provided",
          experience_years: 0,
          otp,
          otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
          email_verified: false
        }, { transaction: tx });

        try {
          await sendOTPEmail(email, otp);
        } catch (err) {
          console.log(`⚠️ Email sending failed. [DEV MODE] Your OTP is: ${otp}`);
        }
      }

      await tx.commit();

      res.status(201).json({
        message: "Registered successfully. Please verify your email.",
        requiresOTP: true,
        email
      });
    } catch (txError) {
      await tx.rollback();
      throw txError;
    }

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
};


// ================= VERIFY OTP =================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const candidate = await Candidate.findOne({
      where: { user_id: user.id }
    });

    if (!candidate) {
      return res.status(400).json({ message: "Candidate profile not found" });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    const failedAttemptsMap = global.otpFailedAttempts || (global.otpFailedAttempts = new Map());
    const failedAttempts = failedAttemptsMap.get(email) || 0;

    if (failedAttempts >= 5) {
      await user.update({ status: "SUSPENDED" });
      return res.status(403).json({ message: "Account locked due to too many failed attempts" });
    }

    if (candidate.otp !== otp) {
      failedAttemptsMap.set(email, failedAttempts + 1);
      return res.status(400).json({ message: "Invalid OTP" });
    }

    failedAttemptsMap.delete(email);

    if (new Date() > candidate.otp_expires_at) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await candidate.update({
      email_verified: true,
      email_verified_at: new Date(),
      otp: null,
      otp_expires_at: null
    });

    res.json({ message: "Email verified successfully" });

  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "OTP verification failed. Please try again." });
  }
};


// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.unscoped().findOne({ where: { email } });
    if (!user) {
      // Log failed login attempt (no user object available)
      await auditLogger.log({
        actionType: "LOGIN",
        userId: "UNKNOWN",
        userRole: "UNKNOWN",
        entityType: "User",
        description: `Failed login attempt — email not found: ${email}`,
        ipAddress: auditLogger.resolveIP(req),
        userAgent: req.headers["user-agent"],
        status: "FAILURE",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await auditLogger.log({
        actionType: "LOGIN",
        userId: String(user.id),
        userRole: user.role,
        entityType: "User",
        entityId: String(user.id),
        description: `Failed login attempt — wrong password for "${email}"`,
        ipAddress: auditLogger.resolveIP(req),
        userAgent: req.headers["user-agent"],
        status: "SUSPICIOUS",
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ===== ROLE-SPECIFIC CHECKS =====

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    if (user.role === "CANDIDATE") {
      const candidate = await Candidate.findOne({
        where: { user_id: user.id }
      });

      if (!candidate.email_verified) {
        return res.status(403).json({
          message: "Please verify your email first",
          requiresOTP: true,
          email
        });
      }

      // Deactivate old sessions
      await CandidateSession.update(
        { is_active: false, ended_at: new Date() },
        { where: { candidate_id: candidate.id, is_active: true } }
      );

      const token = generateToken({
        id: user.id,
        role: user.role,
        token_version: user.auth_token_revision,
        jti: crypto.randomUUID()
      });

      await CandidateSession.create({
        candidate_id: candidate.id,
        session_token: token,
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
        is_active: true,
        started_at: new Date(),
        last_activity_at: new Date(),
        activity_log: [{ action: "LOGIN", timestamp: new Date() }]
      });

      await candidate.update({
        last_login_at: new Date(),
        last_login_ip: req.ip
      });

        // Audit: successful candidate login
        await auditLogger.logLogin(req, user);

        return sendAuthResponse(user, token, res);
      }

      // ===== HR / ADMIN / MD LOGIN =====

      if (user.role === "HR" || user.role === "ADMIN" || user.role === "MD") {
        const token = generateToken({
          id: user.id,
          role: user.role,
          token_version: user.auth_token_revision,
          jti: crypto.randomUUID()
        });

        // Audit: successful HR/Admin/MD login
        await auditLogger.logLogin(req, user);

        return sendAuthResponse(user, token, res);
      }

    return res.status(403).json({ message: "Unauthorized role" });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};



// ================= UPDATE PROFILE =================
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, currentPassword } = req.body;
    const user = await User.unscoped().findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (email && email !== user.email) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to change email" });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(401).json({ message: "Invalid current password" });

      const exists = await User.findOne({ where: { email } });
      if (exists) return res.status(400).json({ message: "Email already in use" });
    }

    await user.update({ name: name || user.name, email: email || user.email });
    res.json({ message: "Profile updated", user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Profile update failed." });
  }
};

// ================= CHANGE PASSWORD =================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Both fields required" });

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character" });
    }

    const user = await User.unscoped().findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Current password is incorrect" });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const newTokenVersion = (user.auth_token_revision || 0) + 1;
    await user.update({ password: hashedNewPassword, auth_token_revision: newTokenVersion });

    res.json({ message: "Password changed successfully. You have been logged out of other devices." });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Password change failed." });
  }
};

// ================= RESEND OTP =================
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const candidate = await Candidate.findOne({ where: { user_id: user.id } });
    if (!candidate) return res.status(400).json({ message: "Candidate profile not found" });
    if (candidate.email_verified) return res.status(400).json({ message: "Email already verified" });

    const otp = crypto.randomInt(100000, 999999).toString();
    await candidate.update({
      otp,
      otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    await sendOTPEmail(email, otp);
    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ error: "Failed to resend OTP. Please try again." });
  }
};

// ================= LOGOUT =================
exports.logout = async (req, res) => {
  try {
    const user = await User.unscoped().findByPk(req.user.id);
    if (user) {
      const newTokenVersion = (user.auth_token_revision || 0) + 1;
      await user.update({ auth_token_revision: newTokenVersion });
    }

    const candidate = await Candidate.findOne({
      where: { user_id: req.user.id }
    });

    if (candidate) {
      await CandidateSession.update(
        { is_active: false, ended_at: new Date() },
        { where: { candidate_id: candidate.id, is_active: true } }
      );
    }

    // Audit: logout
    await auditLogger.log({
      actionType: "LOGOUT",
      userId: String(req.user.id),
      userRole: req.user.role,
      entityType: "User",
      entityId: String(req.user.id),
      description: `User "${req.user.email ?? req.user.id}" logged out`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.headers["user-agent"],
      status: "SUCCESS",
    });

    // Clear the auth cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed." });
  }
};