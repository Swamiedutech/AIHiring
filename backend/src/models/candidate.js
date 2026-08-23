const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define("Candidate", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    education: {
      type: DataTypes.STRING,
      allowNull: false
    },

    specialization: {
      type: DataTypes.STRING,
      allowNull: false
    },

    experience_years: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },

    location: {
      type: DataTypes.STRING,
      allowNull: true
    },

    parsed_resume: {
      type: DataTypes.JSON
    },

    resume_path: {
      type: DataTypes.STRING
    },

    profile_image_path: {
      type: DataTypes.STRING,
      allowNull: true
    },

    ai_score: {
      type: DataTypes.FLOAT
    },

    ai_summary: {
      type: DataTypes.TEXT
    },

    summary: {
      type: DataTypes.TEXT
    },

    current_stage: {
      type: DataTypes.STRING,
      defaultValue: "APPLIED"
    },

    status: {
      type: DataTypes.STRING,
      defaultValue: "IN_PROGRESS"
    },

    integrity_score: {
      type: DataTypes.FLOAT,
      defaultValue: 100
    },

    otp: {
      type: DataTypes.STRING,
      allowNull: true
    },

    otp_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    active_session_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    last_login_ip: {
      type: DataTypes.STRING,
      allowNull: true
    },

    skills: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },

    cgpa: {
      type: DataTypes.FLOAT,
      allowNull: true
    },

    year_of_passout: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    // ── FRESHER / WORKING PROFESSIONAL FIELDS ──────────────────────
    candidate_type: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'FRESHER or WORKING_PROFESSIONAL'
    },

    // Fresher fields
    domain: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Domain of interest'
    },

    area_of_interest: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Area of interest for freshers'
    },

    // Working Professional fields
    current_company: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Current employer'
    },

    working_address: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Work address'
    },

    internships: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Timeline of internships/experiences'
    },

  }, {
    tableName: "Candidates",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  });
};