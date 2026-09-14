module.exports = (sequelize, DataTypes) => {
  const Document = sequelize.define('Document', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    documentId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    applicationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Applications', key: 'id' }
    },
    candidateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Users', key: 'id' }
    },
    documentType: {
      type: DataTypes.ENUM(
        'OFFER_LETTER',
        'ACCEPTANCE_LETTER',
        'REJECTION_LETTER',
        'INTERVIEW_SUMMARY',
        'ASSESSMENT_REPORT',
        'FINAL_REPORT',
        'BACKGROUND_CHECK',
        'REFERENCE_CHECK',
        'CONTRACT',
        'POLICY_DOCUMENT'
      ),
      allowNull: false
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    fileSize: {
      type: DataTypes.INTEGER, // bytes
      defaultValue: 0
    },
    mimeType: {
      type: DataTypes.STRING,
      defaultValue: 'application/pdf'
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false
    },
    storageLocation: {
      type: DataTypes.ENUM('LOCAL', 'AWS_S3', 'AZURE_BLOB', 'GCS'),
      defaultValue: 'LOCAL'
    },
    s3Key: DataTypes.STRING, // For cloud storage
    
    // Document content
    documentData: {
      type: DataTypes.JSON,
      comment: 'Metadata: recipient, subject, salary, startDate, etc.'
    },
    content: {
      type: DataTypes.TEXT,
      comment: 'Full document HTML for preview'
    },
    
    // Versioning
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    parentDocumentId: {
      type: DataTypes.UUID,
      references: { model: 'Documents', key: 'id' },
      comment: 'Reference to previous version'
    },
    versionHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of {version, timestamp, changes, updatedBy}'
    },
    
    // Status tracking
    status: {
      type: DataTypes.ENUM(
        'DRAFT',
        'GENERATED',
        'SENT',
        'VIEWED',
        'SIGNED',
        'ARCHIVED',
        'EXPIRED'
      ),
      defaultValue: 'DRAFT'
    },
    sentDate: DataTypes.DATE,
    viewedDate: DataTypes.DATE,
    signedDate: DataTypes.DATE,
    expiryDate: DataTypes.DATE,
    
    // e-Signature tracking
    signatureRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    signatureStatus: {
      type: DataTypes.ENUM('PENDING', 'SIGNED', 'DECLINED'),
      defaultValue: 'PENDING'
    },
    signatureDetails: {
      type: DataTypes.JSON,
      comment: 'Signature data, IP, timestamp'
    },
    
    // Access control
    visibility: {
      type: DataTypes.ENUM('CANDIDATE_ONLY', 'HR_ONLY', 'BOTH', 'ARCHIVED'),
      defaultValue: 'BOTH'
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    accessLog: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of {userRole, timestamp, action}'
    },
    
    // Metadata
    generatedBy: {
      type: DataTypes.STRING,
      comment: 'User ID or system ID who generated'
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of tags for categorization'
    },
    notes: DataTypes.TEXT,
    
    // Audit
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: {
      type: DataTypes.DATE,
      comment: 'Soft delete timestamp'
    }
  }, {
    timestamps: true,
    paranoid: true, // Soft delete support
    indexes: [
      { fields: ['applicationId', 'documentType'] },
      { fields: ['candidateId', 'status'] },
      { fields: ['createdAt'] },
      { fields: ['documentType', 'status'] }
    ]
  });

  Document.associate = (models) => {
    Document.belongsTo(models.Application);
    Document.belongsTo(models.User, { as: 'candidate' });
    Document.hasMany(models.Document, {
      as: 'versions',
      foreignKey: 'parentDocumentId'
    });
    Document.belongsTo(models.Document, {
      as: 'parentDocument',
      foreignKey: 'parentDocumentId'
    });
  };

  return Document;
};
