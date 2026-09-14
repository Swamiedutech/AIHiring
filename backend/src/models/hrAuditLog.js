module.exports = (sequelize, DataTypes) => {
  const HRAuditLog = sequelize.define('HRAuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    auditId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    applicationId: {
      type: DataTypes.INTEGER,
      references: { model: 'Applications', key: 'id' }
    },
    hrUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    action: {
      type: DataTypes.ENUM(
        'VIEWED_PROFILE',
        'ADDED_NOTE',
        'MADE_DECISION',
        'APPROVED',
        'REJECTED',
        'ESCALATED',
        'GENERATED_OFFER',
        'SENT_OFFER',
        'DOWNLOADED_REPORT',
        'GENERATED_REPORT',
        'VIEWED_ANALYTICS',
        'UPDATED_APPROVAL_RULE',
        'EXPORTED_DATA'
      ),
      allowNull: false
    },
    actionDetail: DataTypes.JSON,
    severity: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      defaultValue: 'LOW'
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userAgent: DataTypes.STRING,
    location: DataTypes.JSON, // Geo-location if available
    changesBefore: DataTypes.JSON,
    changesAfter: DataTypes.JSON,
    affectedFields: {
      type: DataTypes.JSON,
      comment: 'Array of field names that were changed'
    },
    status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PARTIAL'),
      defaultValue: 'SUCCESS'
    },
    errorMessage: DataTypes.TEXT,
    systemInfo: {
      type: DataTypes.JSON,
      comment: 'AI model version, rule version, etc.'
    },
    immutable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true,
    paranoid: false, // Never delete audit logs
    indexes: [
      { fields: ['applicationId'] },
      { fields: ['hrUserId'] },
      { fields: ['action'] },
      { fields: ['createdAt'] },
      { fields: ['severity'] }
    ]
  });

  HRAuditLog.associate = (models) => {
    HRAuditLog.belongsTo(models.Application);
    HRAuditLog.belongsTo(models.User, { as: 'actor' });
  };

  return HRAuditLog;
};
