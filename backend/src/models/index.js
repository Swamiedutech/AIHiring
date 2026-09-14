const { sequelize } = require("../config/db");
const { DataTypes } = require("sequelize");

// ===================== CORE MODELS (as factory functions) =====================
const userModel = require("./user");
const candidateModel = require("./candidate");
const jobModel = require("./job");
const applicationModel = require("./application");
const technicalRoundModel = require("./technicalRound");
const notificationModel = require("./notification");

// Initialize core models
const User = userModel(sequelize);
const Candidate = candidateModel(sequelize);
const Job = jobModel(sequelize);
const Application = applicationModel(sequelize);
const TechnicalRound = technicalRoundModel(sequelize);
const Notification = notificationModel(sequelize);

const resumeModel = require("./Resume");

const mcqQuestionModel = require("./mcqQuestion");
const mcqAnswerModel = require("./mcqAnswer");

const interviewModel = require("./interview");
const interviewAnswerModel = require("./interviewAnswer");

const malpracticeEventModel = require("./malpracticeEvent");
const offerModel = require("./offer");

// Initialize additional models
const Interview = interviewModel(sequelize);
const InterviewAnswer = interviewAnswerModel(sequelize);
const MalpracticeEvent = malpracticeEventModel(sequelize);
const Offer = offerModel(sequelize);

// ===================== NEW MODELS (CANDIDATE PANEL) =====================
const applicationStatusLogModel = require("./applicationStatusLog");
const assessmentAttemptModel = require("./assessmentAttempt");
const interviewSessionModel = require("./interviewSession");
const candidateSessionModel = require("./candidateSession");
const documentRecordModel = require("./documentRecord");
const notificationQueueModel = require("./notificationQueue");

// Initialize new models
const ApplicationStatusLog = applicationStatusLogModel(sequelize);
const AssessmentAttempt = assessmentAttemptModel(sequelize);
const InterviewSession = interviewSessionModel(sequelize);
const CandidateSession = candidateSessionModel(sequelize);
const DocumentRecord = documentRecordModel(sequelize);
const NotificationQueue = notificationQueueModel(sequelize);
const MCQQuestion = mcqQuestionModel(sequelize);
const MCQAnswer = mcqAnswerModel(sequelize);

// ===================== ADMIN PANEL MODELS =====================
const adminJobModel = require("./adminJob");
const aiConfigModel = require("./aiConfig");
const aiModelModel = require("./aiModel");
const adminWorkflowModel = require("./adminWorkflow");
const offerTemplateModel = require("./offerTemplate");
const adminAuditLogModel = require("./adminAuditLog");
const dataRetentionPolicyModel = require("./dataRetentionPolicy");
const systemHealthModel = require("./systemHealth");
const approvalRecordModel = require("./approvalRecord");

// Initialize admin models
const AdminJob = adminJobModel(sequelize);
const AIConfig = aiConfigModel(sequelize);
const AIModel = aiModelModel(sequelize);
const AdminWorkflow = adminWorkflowModel(sequelize);
const OfferTemplate = offerTemplateModel(sequelize);
const AdminAuditLog = adminAuditLogModel(sequelize);
const DataRetentionPolicy = dataRetentionPolicyModel(sequelize);
const SystemHealth = systemHealthModel(sequelize);
const ApprovalRecord = approvalRecordModel(sequelize);

// Associations for ApprovalRecord
Application.hasMany(ApprovalRecord, { foreignKey: 'applicationId' });
ApprovalRecord.belongsTo(Application, { foreignKey: 'applicationId' });
User.hasMany(ApprovalRecord, { foreignKey: 'hrUserId', as: 'approvals' });
ApprovalRecord.belongsTo(User, { foreignKey: 'hrUserId', as: 'reviewer' });

const Resume = resumeModel(sequelize);

// ===================== QUESTION BANK MODELS =====================
const interviewQuestionBankModel = require("./interviewQuestionBank");
const technicalQuestionBankModel = require("./technicalQuestionBank");

const InterviewQuestionBank = interviewQuestionBankModel(sequelize);
const TechnicalQuestionBank = technicalQuestionBankModel(sequelize);

// ===================== AI ANALYSIS MODELS =====================
const resumeAnalysisModel = require("./resumeAnalysis");
const assessmentAnalysisModel = require("./assessmentAnalysis");
const interviewAnalysisModel = require("./interviewAnalysis");
const aiDecisionModel = require("./aiDecision");

const ResumeAnalysis = resumeAnalysisModel(sequelize);
const AssessmentAnalysis = assessmentAnalysisModel(sequelize);
const InterviewAnalysis = interviewAnalysisModel(sequelize);
const AIDecision = aiDecisionModel(sequelize);

// ===================== SCORING MODELS =====================
const manualJobMappingModel = require("./manualJobMapping");
const hrApprovalRuleModel = require("./hrApprovalRule");
const ManualJobMapping = manualJobMappingModel(sequelize);
const HRApprovalRule = hrApprovalRuleModel(sequelize);

// ===================== ASSOCIATIONS =====================

// User ↔ HRApprovalRule
User.hasMany(HRApprovalRule, { foreignKey: "createdBy", as: "createdRules" });
HRApprovalRule.belongsTo(User, { as: "creator", foreignKey: "createdBy" });

// User ↔ Candidate
User.hasOne(Candidate, { foreignKey: "user_id" });
Candidate.belongsTo(User, { foreignKey: "user_id" });

// Candidate ↔ Application
Candidate.hasMany(Application, { foreignKey: "candidate_id" });
Application.belongsTo(Candidate, { foreignKey: "candidate_id" });

// Application ↔ Resume
Application.hasOne(Resume, { foreignKey: "application_id" });
Resume.belongsTo(Application, { foreignKey: "application_id" });

// Job ↔ Application
Job.hasMany(Application, { foreignKey: "job_id" });
Application.belongsTo(Job, { foreignKey: "job_id" });

// Application ↔ Technical Round
Application.hasOne(TechnicalRound, { foreignKey: "application_id" });
TechnicalRound.belongsTo(Application, { foreignKey: "application_id" });

// MCQ Attempt ↔ Answers
AssessmentAttempt.hasMany(MCQAnswer, { foreignKey: "attempt_id" });
MCQAnswer.belongsTo(AssessmentAttempt, { foreignKey: "attempt_id" });

// Job ↔ MCQ Questions
Job.hasMany(MCQQuestion, { foreignKey: "job_id" });
MCQQuestion.belongsTo(Job, { foreignKey: "job_id" });

// Job ↔ ManualJobMapping
Job.hasOne(ManualJobMapping, { foreignKey: "jobId", as: "manualMapping" });
ManualJobMapping.belongsTo(Job, { foreignKey: "jobId", as: "job" });

// Application ↔ Interview
Application.hasOne(Interview, { foreignKey: "application_id" });
Interview.belongsTo(Application, { foreignKey: "application_id" });

// Interview ↔ Answers
Interview.hasMany(InterviewAnswer, { foreignKey: "interview_id" });
InterviewAnswer.belongsTo(Interview, { foreignKey: "interview_id" });

// Application ↔ Malpractice Events
Application.hasMany(MalpracticeEvent, { foreignKey: "application_id" });
MalpracticeEvent.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ Offer
Application.hasOne(Offer, { foreignKey: "application_id", as: "offer" });
Offer.belongsTo(Application, { foreignKey: "application_id", as: "application" });

// ===================== NEW ASSOCIATIONS (CANDIDATE PANEL) =====================

// Application ↔ ApplicationStatusLog
Application.hasMany(ApplicationStatusLog, { foreignKey: "application_id" });
ApplicationStatusLog.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ AssessmentAttempt
Application.hasMany(AssessmentAttempt, { foreignKey: "application_id", as: "assessment_attempts" });
AssessmentAttempt.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ InterviewSession
Application.hasMany(InterviewSession, { foreignKey: "application_id", as: "interview_sessions" });
InterviewSession.belongsTo(Application, { foreignKey: "application_id" });
Application.hasOne(InterviewSession, { foreignKey: "application_id", as: "interview_session" });

// Candidate ↔ CandidateSession
Candidate.hasMany(CandidateSession, { foreignKey: "candidate_id" });
CandidateSession.belongsTo(Candidate, { foreignKey: "candidate_id" });

// Application ↔ DocumentRecord
Application.hasMany(DocumentRecord, { foreignKey: "application_id" });
DocumentRecord.belongsTo(Application, { foreignKey: "application_id" });

// Candidate ↔ NotificationQueue
Candidate.hasMany(NotificationQueue, { foreignKey: "candidate_id" });
NotificationQueue.belongsTo(Candidate, { foreignKey: "candidate_id" });

// Application ↔ NotificationQueue (optional relation)
Application.hasMany(NotificationQueue, { foreignKey: "application_id" });
NotificationQueue.belongsTo(Application, { foreignKey: "application_id" });

// ===================== AI ANALYSIS ASSOCIATIONS =====================

// Application ↔ ResumeAnalysis
Application.hasOne(ResumeAnalysis, { foreignKey: "application_id" });
ResumeAnalysis.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ AssessmentAnalysis
Application.hasOne(AssessmentAnalysis, { foreignKey: "application_id" });
AssessmentAnalysis.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ InterviewAnalysis
Application.hasOne(InterviewAnalysis, { foreignKey: "application_id" });
InterviewAnalysis.belongsTo(Application, { foreignKey: "application_id" });

// Application ↔ AIDecision
Application.hasOne(AIDecision, { foreignKey: "application_id" });
AIDecision.belongsTo(Application, { foreignKey: "application_id" });

// ===================== ADMIN & QUESTION BANK ASSOCIATIONS =====================

// Job ↔ TechnicalQuestionBank
Job.hasMany(TechnicalQuestionBank, { foreignKey: "job_id" });
TechnicalQuestionBank.belongsTo(Job, { foreignKey: "job_id" });

// Job ↔ InterviewQuestionBank
Job.hasMany(InterviewQuestionBank, { foreignKey: "job_id" });
InterviewQuestionBank.belongsTo(Job, { foreignKey: "job_id" });

// ===================== NEW MISSING MODELS =====================
const documentModel = require("./document");
const hrAuditLogModel = require("./hrAuditLog");
const hrInternalNoteModel = require("./hrInternalNote");
const evaluationProsConsModel = require("./evaluationProsCons");
const Session = require("./session");

const Document = documentModel(sequelize, DataTypes);
const HRAuditLog = hrAuditLogModel(sequelize, DataTypes);
const HRInternalNote = hrInternalNoteModel(sequelize, DataTypes);
const EvaluationProsCons = evaluationProsConsModel(sequelize, DataTypes);

// Missing Associations
Application.hasMany(HRAuditLog, { foreignKey: 'applicationId' });
HRAuditLog.belongsTo(Application, { foreignKey: 'applicationId' });
User.hasMany(HRAuditLog, { foreignKey: 'hrUserId' });
HRAuditLog.belongsTo(User, { foreignKey: 'hrUserId' });

Application.hasMany(HRInternalNote, { foreignKey: 'applicationId' });
HRInternalNote.belongsTo(Application, { foreignKey: 'applicationId' });
User.hasMany(HRInternalNote, { foreignKey: 'hrUserId' });
HRInternalNote.belongsTo(User, { foreignKey: 'hrUserId' });

Application.hasMany(EvaluationProsCons, { foreignKey: 'applicationId' });
EvaluationProsCons.belongsTo(Application, { foreignKey: 'applicationId' });

Application.hasMany(Document, { foreignKey: 'applicationId' });
Document.belongsTo(Application, { foreignKey: 'applicationId' });
User.hasMany(Document, { foreignKey: 'candidateId' });
Document.belongsTo(User, { foreignKey: 'candidateId' });

// ===================== EXPORT =====================
module.exports = {
  sequelize,
  User,
  Candidate,
  Job,
  Application,
  TechnicalRound,
  Notification,
  MCQQuestion,
  MCQAnswer,
  Interview,
  InterviewAnswer,
  MalpracticeEvent,
  Offer,
  Resume,
  // New models
  ApplicationStatusLog,
  AssessmentAttempt,
  InterviewSession,
  CandidateSession,
  DocumentRecord,
  NotificationQueue,
  // Admin Panel Models
  AdminJob,
  AIConfig,
  AIModel,
  AdminWorkflow,
  OfferTemplate,
  AdminAuditLog,
  DataRetentionPolicy,
  SystemHealth,
  // Question Bank Models
  InterviewQuestionBank,
  TechnicalQuestionBank,
  // AI Analysis Models
  ResumeAnalysis,
  AssessmentAnalysis,
  InterviewAnalysis,
  AIDecision,
  // Scoring & Governance Models
  ManualJobMapping,
  HRApprovalRule,
  ApprovalRecord,
  // Missing Models
  Document,
  Session,
  HRAuditLog,
  HRInternalNote,
  EvaluationProsCons
};
