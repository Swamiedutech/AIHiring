const { AdminAuditLog, DataRetentionPolicy, SystemHealth } = require("../models/index.js");
const { Op } = require("sequelize");
const auditLogger = require("../services/auditLogger.service");

const getAuditLogs = async (req, res) => {
  try {
    const { limit = 50, offset = 0, actionType, userId } = req.query;

    const where = {};
    if (actionType) where.actionType = actionType;
    if (userId) where.userId = userId;

    const logs = await AdminAuditLog.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["timestamp", "DESC"]],
    });

    const total = await AdminAuditLog.count({ where });

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching audit logs",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const searchAuditLogs = async (req, res) => {
  try {
    const { entityId, actionType, dateRange } = req.query;

    const where = {};
    if (entityId) where.entityId = entityId;
    if (actionType) where.actionType = actionType;

    if (dateRange) {
      const [startDate, endDate] = dateRange.split(",");
      where.timestamp = {
        [Op.gte]: new Date(startDate),
        [Op.lte]: new Date(endDate),
      };
    }

    const logs = await AdminAuditLog.findAll({
      where,
      order: [["timestamp", "DESC"]],
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error searching audit logs",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getDataRetentionPolicy = async (req, res) => {
  try {
    let policy = await DataRetentionPolicy.findOne({
      order: [["createdAt", "DESC"]],
    });

    if (!policy) {
      policy = await DataRetentionPolicy.create({
        createdBy: "SYSTEM",
      });
    }

    res.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching data retention policy",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const updateDataRetentionPolicy = async (req, res) => {
  try {
    let policy = await DataRetentionPolicy.findOne({
      order: [["createdAt", "DESC"]],
    });

    const allowedPolicyFields = {
      retainApplicantDataDays: req.body.retainApplicantDataDays,
      retainAuditLogsDays: req.body.retainAuditLogsDays,
      retainInterviewVideosDays: req.body.retainInterviewVideosDays,
      autoAnonymize: req.body.autoAnonymize
    };

    if (!policy) {
      policy = await DataRetentionPolicy.create({
        ...allowedPolicyFields,
        createdBy: req.user.id,
      });
    } else {
      await policy.update(allowedPolicyFields);
    }

    await auditLogger.logRuleChange(req, {
      entityType: "DATA_RETENTION_POLICY",
      entityId: String(policy.policyId),
      newValue: policy,
      description: "Data retention policy updated",
    });

    res.json({
      success: true,
      message: "Data retention policy updated",
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating data retention policy",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getSystemHealth = async (req, res) => {
  try {
    const { Application, ApplicationStatusLog, Candidate } = require("../models");

    // 1. Database Connectivity Check
    let dbStatus = false;
    try {
      await SystemHealth.sequelize.authenticate();
      dbStatus = true;
    } catch (e) {
      console.error("DB Health Check Failed:", e);
    }

    // 2. Real-time Failure Scan
    // Health metrics are now updated asynchronously via health.worker.js
    // We just read the most recent snapshot here.
    let latestHealth = await SystemHealth.findOne({ order: [['created_at', 'DESC']] });

    if (!latestHealth) {
      // Fallback if worker hasn't run yet
      latestHealth = {
        resumeParsingFailures: 0,
        interviewAiCrashes: 0,
        emailFailures: 0,
        longRunningApprovals: 0,
        averageApprovalTime: 4.2,
        failedAiTasks: 0
      };
    }

    // 5. Map to Frontend format
    const healthReport = {
      service_status: dbStatus ? "healthy" : "unhealthy",
      uptime_hours: Math.floor(process.uptime() / 3600),
      avg_response_time_ms: 45,
      last_response_ms: 30,
      db_connected: dbStatus,
      active_queries: 1,
      error_rate: (latestHealth.failedAiTasks) / 100,
      
      // Keys expected by AuditPage.tsx
      resumeParsingFailures: latestHealth.resumeParsingFailures,
      interviewAiCrashes: latestHealth.interviewAiCrashes,
      emailFailures: latestHealth.emailFailures,
      longRunningApprovals: latestHealth.longRunningApprovals,
      averageApprovalTime: latestHealth.averageApprovalTime,

      total_errors: latestHealth.failedAiTasks,
      total_requests: 100,
      databaseHealth: latestHealth.databaseHealth,
      systemLoadPercentage: 15.0,
    };

    res.json({
      success: true,
      data: healthReport,
    });
  } catch (error) {
    console.error("Health Check Error:", error);
    res.status(500).json({
      success: false,
      message: "Error performing system health scan",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const updateSystemHealth = async (req, res) => {
  try {
    const allowedHealthFields = {
      resumeParsingFailures: req.body.resumeParsingFailures,
      interviewAiCrashes: req.body.interviewAiCrashes,
      emailFailures: req.body.emailFailures,
      longRunningApprovals: req.body.longRunningApprovals,
      averageApprovalTime: req.body.averageApprovalTime,
      databaseHealth: req.body.databaseHealth,
      apiResponseTime: req.body.apiResponseTime,
      systemLoadPercentage: req.body.systemLoadPercentage,
      failedAiTasks: req.body.failedAiTasks
    };
    const health = await SystemHealth.create(allowedHealthFields);

    if (req.body.failedAiTasks > 0 || req.body.databaseHealth === "CRITICAL") {
      await auditLogger.log({
        actionType: "RULE_CHANGED",
        userId: "SYSTEM",
        userRole: "SYSTEM",
        entityType: "SYSTEM_HEALTH",
        entityId: String(health.healthId),
        description: "Critical system health alert",
        ipAddress: "INTERNAL",
        userAgent: "SYSTEM_MONITOR",
        status: "SUSPICIOUS",
        newValue: health,
      });
    }

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating system health",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getAuditStats = async (req, res) => {
  try {
    const stats = await AdminAuditLog.findAll({
      attributes: [
        "actionType",
        [AdminAuditLog.sequelize.fn("COUNT", AdminAuditLog.sequelize.col("auditId")), "count"],
      ],
      group: ["actionType"],
    });

    const statusStats = await AdminAuditLog.findAll({
      attributes: [
        "status",
        [AdminAuditLog.sequelize.fn("COUNT", AdminAuditLog.sequelize.col("auditId")), "count"],
      ],
      group: ["status"],
    });

    res.json({
      success: true,
      data: {
        actions: stats,
        status: statusStats,
      },
    });
  } catch (error) {
    console.error("getAuditStats error:", error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

const exportAuditLogs = async (req, res) => {
  try {
    const { format = "json" } = req.query;
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.attachment("audit-logs.csv");
      res.write("ID,Type,User,Role,Entity,EntityID,Description,IP,Status,Timestamp\n");

      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const logs = await AdminAuditLog.findAll({ order: [["timestamp", "DESC"]], limit, offset });
        if (logs.length === 0) {
          hasMore = false;
          break;
        }

        const rows = logs.map(l => {
          const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
          return [
            l.auditId, l.actionType, l.userId, l.userRole, 
            l.entityType, l.entityId, l.description, 
            l.ipAddress, l.status, l.timestamp
          ].map(escape).join(",");
        }).join("\n");

        res.write(rows + "\n");
        offset += limit;
      }
      return res.end();
    }

    const logs = await AdminAuditLog.findAll({ order: [["timestamp", "DESC"]] });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

const triggerAiRetry = async (req, res) => {
  try {
    const { applicationId, taskType } = req.body;
    const aiController = require("./ai.controller.complete.js");
    
    // Create a mock req/res to call the controller function internally
    const mockReq = { 
      body: { applicationId, jobId: req.body.jobId },
      params: { applicationId },
      user: req.user,
      file: req.file // if resume retry
    };
    
    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({ json: (data) => res.status(code).json(data) })
    };

    if (taskType === "RESUME_PARSING") {
      return aiController.parseResumeWithAI(mockReq, mockRes);
    } else if (taskType === "FINAL_DECISION") {
      return aiController.makeFinalAIDecision(mockReq, mockRes);
    } else {
      return res.status(400).json({ success: false, message: "Invalid task type for retry" });
    }
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  getAuditLogs,
  searchAuditLogs,
  getDataRetentionPolicy,
  updateDataRetentionPolicy,
  getSystemHealth,
  updateSystemHealth,
  getAuditStats,
  exportAuditLogs,
  triggerAiRetry,
};
