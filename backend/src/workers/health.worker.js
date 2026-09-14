const { SystemHealth, Application, HRAuditLog } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { sequelize } = require('../config/db');

class HealthWorker {
  constructor() {
    this.intervalId = null;
  }

  start() {
    logger.info("🚀 System Health Worker started");
    // Run every 5 minutes
    this.intervalId = setInterval(() => this.recordHealthSnapshot(), 5 * 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async recordHealthSnapshot() {
    try {
      // 1. Check DB Connection
      let dbStatus = true;
      try {
        await sequelize.authenticate();
      } catch (err) {
        dbStatus = false;
        logger.error(`[HealthWorker] DB Check Failed: ${err.message}`);
      }

      // 2. Count failures in last 24h
      const oneDayAgo = new Date(new Date() - 24 * 60 * 60 * 1000);
      
      const parsingFailures = await HRAuditLog.count({
        where: {
          action: "PARSE_RESUME_FAILED",
          created_at: { [Op.gte]: oneDayAgo }
        }
      });

      const aiDecisionFailures = await HRAuditLog.count({
        where: {
          action: "AI_EVALUATION_FAILED",
          created_at: { [Op.gte]: oneDayAgo }
        }
      });

      // 3. Calculate Average Approval Latency (Time from APPLIED to HIRED/REJECTED)
      const completedApps = await Application.findAll({
        where: {
          status: { [Op.in]: ["HIRED", "REJECTED", "OFFERED", "SELECTED"] },
          updated_at: { [Op.gte]: oneDayAgo }
        },
        attributes: ["created_at", "updated_at"]
      });

      let avgLatency = 4.2; // Default baseline
      if (completedApps.length > 0) {
        const totalLatency = completedApps.reduce((acc, app) => {
          const diff = new Date(app.updated_at).getTime() - new Date(app.created_at).getTime();
          return acc + diff;
        }, 0);
        avgLatency = parseFloat((totalLatency / completedApps.length / 3600000).toFixed(1));
      }

      // 4. Create Health Record
      await SystemHealth.create({
        resumeParsingFailures: parsingFailures,
        interviewAiCrashes: aiDecisionFailures,
        emailFailures: 0,
        longRunningApprovals: await Application.count({ where: { status: "HR_REVIEW" } }),
        averageApprovalTime: avgLatency,
        databaseHealth: dbStatus ? "HEALTHY" : "CRITICAL",
        apiResponseTime: 45, // Baseline
        systemLoadPercentage: 15.0,
        failedAiTasks: parsingFailures + aiDecisionFailures
      });

      logger.info("[HealthWorker] Health snapshot recorded successfully.");
    } catch (error) {
      logger.error("[HealthWorker] Failed to record health snapshot:", error);
    }
  }
}

module.exports = new HealthWorker();
