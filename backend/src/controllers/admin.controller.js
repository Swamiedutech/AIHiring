const bcrypt = require("bcryptjs");
const { User, HRApprovalRule } = require("../models");
const auditLogger = require("../services/auditLogger.service");

exports.getHRs = async (req, res) => {
  try {
    const hrs = await User.findAll({
      where: { role: "HR" },
      attributes: ["id", "name", "email", "status", "hr_role", "created_at"]
    });
    const mapped = hrs.map(u => ({ ...u.toJSON(), _id: String(u.id) }));
    res.json(mapped);
  } catch (error) {
    console.error("getHRs error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

exports.createHR = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const hr = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "HR",
      hr_role: "VIEWER", // Default role
      email_verified: true // Auto-verify for manually created HRs
    });

    await auditLogger.log({
      actionType: "RULE_CHANGED",
      userId: String(req.user.id),
      userRole: req.user.role,
      entityType: "User",
      entityId: String(hr.id),
      description: `HR account created for "${hr.email}" by Admin ${req.user.id}`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.headers["user-agent"],
      newValue: { name: hr.name, email: hr.email, hr_role: hr.hr_role },
      status: "SUCCESS",
    });

    res.status(201).json({
      message: "HR created successfully",
      hr: {
        id: hr.id,
        _id: String(hr.id),
        name: hr.name,
        email: hr.email,
        role: hr.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteHR = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ where: { id, role: "HR" } });

    if (!user) {
      return res.status(404).json({ message: "HR account not found" });
    }

    await auditLogger.log({
      actionType: "ACCESS_REVOKED",
      userId: String(req.user.id),
      userRole: req.user.role,
      entityType: "User",
      entityId: String(user.id),
      description: `HR account deleted for "${user.email}" by Admin ${req.user.id}`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.headers["user-agent"],
      oldValue: { name: user.name, email: user.email, hr_role: user.hr_role },
      status: "SUCCESS",
    });

    await user.destroy();
    res.json({ message: "HR account deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateHR = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, hr_role } = req.body;
    
    const user = await User.findOne({ where: { id, role: "HR" } });
    if (!user) {
      return res.status(404).json({ message: "HR account not found" });
    }

    const oldSnapshot = { status: user.status, hr_role: user.hr_role };

    if (status) user.status = status;
    if (hr_role) user.hr_role = hr_role;

    await user.save();

    await auditLogger.log({
      actionType: "RULE_CHANGED",
      userId: String(req.user.id),
      userRole: req.user.role,
      entityType: "User",
      entityId: String(user.id),
      description: `HR account updated for "${user.email}" (role: ${user.hr_role}, status: ${user.status})`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.headers["user-agent"],
      oldValue: oldSnapshot,
      newValue: { status: user.status, hr_role: user.hr_role },
      status: "SUCCESS",
    });
    
    res.json({
      message: "HR account updated successfully",
      hr: {
        id: user.id,
        _id: String(user.id),
        name: user.name,
        email: user.email,
        status: user.status,
        hr_role: user.hr_role,
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.forceLogoutHR = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ where: { id, role: "HR" } });

    if (!user) {
      return res.status(404).json({ message: "HR account not found" });
    }

    // Increment auth_token_revision, invalidating all current tokens
    user.auth_token_revision = (user.auth_token_revision || 0) + 1;
    await user.save();

    await auditLogger.log({
      actionType: "ACCESS_REVOKED",
      userId: String(req.user.id),
      userRole: req.user.role,
      entityType: "User",
      entityId: String(user.id),
      description: `Admin force-logged-out HR "${user.email}" (token revision bumped)`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.headers["user-agent"],
      status: "SUCCESS",
    });

    res.json({ message: "HR forcefully logged out." });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getApprovalRules = async (req, res) => {
  try {
    const rules = await HRApprovalRule.findAll({
      order: [["stage", "ASC"]],
    });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.createApprovalRule = async (req, res) => {
  try {
    const { stage, threshold, timeoutHours, role, minRole } = req.body;

    // Map frontend stages to DB ENUM
    const stageMap = {
      "Screening": "RESUME",
      "Assessment": "TECHNICAL",
      "Interview": "INTERVIEW",
      "FinalDecision": "FINAL"
    };

    const dbStage = stageMap[stage] || "TECHNICAL";

    // Count active HR users for dynamic quorum
    const hrCount = await User.count({ where: { role: "HR", status: "ACTIVE" } });
    const effectiveThreshold = threshold / 100;
    const approvalsNeeded = Math.max(1, Math.ceil(hrCount * effectiveThreshold));

    const rule = await HRApprovalRule.create({
      ruleId: `rule_${Date.now()}`,
      stage: dbStage,
      approvalsRequired: approvalsNeeded,
      approvalThreshold: effectiveThreshold,
      slaHours: timeoutHours || 24,
      role: role || null,
      isActive: true,
      createdBy: req.user.id
    });

    await auditLogger.logRuleChange(req, {
      entityType: "HR_APPROVAL_RULE",
      entityId: String(rule.id),
      newValue: rule,
      description: `New governance rule deployed for stage ${dbStage}. Quorum set to ${approvalsNeeded} (${threshold}%).`,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    console.error("createApprovalRule error:", error);
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};
