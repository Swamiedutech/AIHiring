module.exports = (sequelize, DataTypes) => {
  const HRInternalNote = sequelize.define('HRInternalNote', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    noteId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    applicationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Applications', key: 'id' }
    },
    hrUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    stage: {
      type: DataTypes.ENUM(
        'RESUME',
        'TECHNICAL',
        'INTERVIEW',
        'DECISION',
        'OFFER'
      ),
      allowNull: false
    },
    noteType: {
      type: DataTypes.ENUM(
        'OBSERVATION',
        'CONCERN',
        'STRENGTH',
        'ESCALATION',
        'FOLLOW_UP'
      ),
      defaultValue: 'OBSERVATION'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of tags for quick filtering'
    },
    visibility: {
      type: DataTypes.ENUM('PRIVATE', 'TEAM', 'ALL_HR'),
      defaultValue: 'TEAM'
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    editHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of {version, timestamp, oldContent, editedBy}'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deletedBy: DataTypes.UUID,
    deletedAt: DataTypes.DATE
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['applicationId'] },
      { fields: ['hrUserId'] },
      { fields: ['stage'] }
    ]
  });

  HRInternalNote.associate = (models) => {
    HRInternalNote.belongsTo(models.Application);
    HRInternalNote.belongsTo(models.User, { as: 'author' });
  };

  return HRInternalNote;
};
