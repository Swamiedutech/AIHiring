const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("NotificationQueue", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    candidate_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    application_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Related application if any"
    },
    notification_type: {
      type: DataTypes.ENUM(
        "APPLICATION_RECEIVED",
        "RESUME_EVALUATED",
        "ASSESSMENT_AVAILABLE",
        "ASSESSMENT_COMPLETED",
        "INTERVIEW_AVAILABLE",
        "INTERVIEW_SCHEDULED",
        "INTERVIEW_REMINDER",
        "INTERVIEW_COMPLETED",
        "OFFER_LETTER_READY",
        "REJECTION",
        "RECOMMENDATION",
        "OTHER"
      ),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("PENDING", "PROCESSING", "SENT", "READ", "FAILED"),
      defaultValue: "PENDING"
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    action_url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL to redirect when notification clicked"
    },
    sent_via_email: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    retry_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Additional data for email templates (e.g. salary, position)"
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Error message if status is FAILED"
    }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    tableName: 'NotificationQueues'
  });
};
