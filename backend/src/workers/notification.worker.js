const { NotificationQueue, Candidate, User } = require("../models");
const emailService = require("../services/email.service");
const logger = require("../utils/logger");

/**
 * Notification Worker
 * Periodically checks for pending notifications and sends emails
 */
class NotificationWorker {
  constructor(intervalMs = 30000) { // Default 30 seconds
    this.intervalMs = intervalMs;
    this.timer = null;
    this.isProcessing = false;
  }

  start() {
    if (this.timer) return;
    logger.info(`🚀 Notification Worker started (Interval: ${this.intervalMs}ms)`);
    this.timer = setInterval(() => this.processQueue(), this.intervalMs);
    // Also run immediately on start
    this.processQueue();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("🛑 Notification Worker stopped");
    }
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { sequelize } = require("../models");
      const pendingNotifications = await sequelize.transaction(async (t) => {
        const rows = await NotificationQueue.findAll({
          where: {
            status: "PENDING",
            retry_count: { [require("sequelize").Op.lt]: 3 }
          },
          limit: 10,
          lock: true,
          skipLocked: true,
          transaction: t
        });

        if (rows.length > 0) {
          const ids = rows.map(r => r.id);
          await NotificationQueue.update(
            { status: "PROCESSING" },
            { where: { id: ids }, transaction: t }
          );
        }
        return rows;
      });

      if (pendingNotifications.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info(`📨 Processing ${pendingNotifications.length} pending notifications...`);

      for (const notification of pendingNotifications) {
        try {
          const candidate = await Candidate.findByPk(notification.candidate_id, {
            include: [{ model: User }]
          });

          if (!candidate || !candidate.User?.email) {
            await notification.update({
              status: "FAILED",
              error_message: "Candidate or email not found"
            });
            continue;
          }

          // Determine if we should send an email based on type or explicit flag
          const shouldSendEmail = notification.sent_via_email === false; // If not already sent

          if (shouldSendEmail) {
            let emailSent = false;
            const meta = notification.metadata || {};

            // Map notification types to email templates
            switch (notification.notification_type) {
              case "OFFER_LETTER_READY":
                emailSent = await emailService.sendOfferLetterEmail(
                  candidate.User.email,
                  candidate.User.name,
                  meta.position || meta.jobTitle || "Target Role",
                  meta.salary || 1000000,
                  meta.joining_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                );
                break;
              case "REJECTION":
                emailSent = await emailService.sendRejectionEmail(
                  candidate.User.email,
                  candidate.User.name,
                  meta.jobTitle || "the position"
                );
                break;
              case "RECOMMENDATION":
                emailSent = await emailService.sendRecommendationEmail(
                  candidate.User.email,
                  candidate.User.name,
                  meta.jobTitle || "the position",
                  meta.finalScore || 0
                );
                break;
              default:
                emailSent = await emailService.sendNotificationEmail(
                  candidate.User.email,
                  notification.title,
                  notification.message,
                  notification.action_url
                );
            }

            if (emailSent) {
              await notification.update({
                status: "SENT",
                sent_via_email: true,
                sent_at: new Date()
              });
            } else {
              throw new Error("Email service returned false");
            }
          } else {
            // Just mark as sent if no email needed (though usually PENDING means needs action)
            await notification.update({ status: "SENT", sent_at: new Date() });
          }

        } catch (err) {
          logger.error(`❌ Failed to process notification ${notification.id}:`, err.message);
          await notification.update({
            retry_count: notification.retry_count + 1,
            error_message: err.message,
            status: notification.retry_count >= 2 ? "FAILED" : "PENDING"
          });
        }
      }
    } catch (error) {
      logger.error("❌ Notification Worker Error:", error);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = new NotificationWorker();
