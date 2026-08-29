const {
  Application, Candidate, User,
  Notification, ApplicationStatusLog, NotificationQueue, AssessmentAttempt,
  InterviewSession, InterviewAnalysis, MalpracticeEvent, Job, Offer
} = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const auditLogger = require('../services/auditLogger.service');
const { computeApplicationScore } = require('../utils/applicationStatus.utils');
const aiService = require('../services/ai.service');

// ── EXACT enum values (verified via pg_enum) ──────────────────────
const FINAL_STATES = ['SELECTED', 'REJECTED'];

class HRDecisionController {

  /**
   * POST /hr/decision/:applicationId
   */
  static async makeDecision(req, res) {
    const { applicationId } = req.params;
    const { decision, reason, comments } = req.body;
    const userId = req.user.id;

    try {
      if (!applicationId || applicationId === 'undefined') {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }
      const VALID = ['APPROVED', 'REJECTED', 'ON_HOLD', 'REQUEST_RE_INTERVIEW', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW', 'REQUEST_RE_ASSESSMENT', 'FINAL_SELECTION', 'SEND_OFFER'];
      if (!VALID.includes(decision)) {
        return res.status(400).json({ success: false, message: `Invalid decision. Must be one of: ${VALID.join(', ')}` });
      }
      const requiredReason = decision !== 'SEND_TO_ASSESSMENT';
      if (requiredReason && !reason?.trim()) {
        return res.status(400).json({ success: false, message: 'Reason is required' });
      }

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User }] }]
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }
      // Allow unlocking decisions even if currently in a final state
      const isReAction = ['REQUEST_RE_INTERVIEW', 'REQUEST_RE_ASSESSMENT', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW'].includes(decision);
      if (FINAL_STATES.includes(application.status) && application.hr_decision && !isReAction) {
        return res.status(409).json({ success: false, message: 'Decision already finalised and locked' });
      }

      const prevStatus = application.status;

      const STATUS_MAP = {
        SEND_TO_ASSESSMENT: 'ASSESSMENT_UNLOCKED',
        APPROVE_FOR_INTERVIEW: 'INTERVIEW_UNLOCKED',
        REQUEST_RE_INTERVIEW: 'INTERVIEW_UNLOCKED',
        APPROVED: 'SELECTED',
        FINAL_SELECTION: 'SELECTED',
        REJECTED: 'REJECTED',
        ON_HOLD: 'HR_REVIEW',
        REQUEST_RE_ASSESSMENT: 'ASSESSMENT_UNLOCKED',
        SEND_OFFER: 'OFFER_SENT',
      };

      const newStatus = STATUS_MAP[decision];
      if (!newStatus) {
        return res.status(400).json({ success: false, message: 'Unsupported decision type' });
      }

      // --- QUORUM LOGIC START ---
      const { HRApprovalRule, ApprovalRecord } = require('../models');
      const getStageMapping = (status) => {
        if (['APPLIED', 'RESUME_SUBMITTED', 'RESUME_EVALUATED'].includes(status)) return { approval: 'RESUME_REVIEW', rule: 'RESUME' };
        if (status.includes('ASSESSMENT') || status.includes('TECHNICAL')) return { approval: 'TECHNICAL_REVIEW', rule: 'TECHNICAL' };
        if (status.includes('INTERVIEW')) return { approval: 'INTERVIEW_REVIEW', rule: 'INTERVIEW' };
        return { approval: 'FINAL_DECISION', rule: 'FINAL' };
      };
      
      const { approval: approvalStage, rule: ruleStage } = getStageMapping(prevStatus);
      const activeRule = await HRApprovalRule.findOne({ where: { stage: ruleStage, isActive: true } });
      
      let quorumReached = true;
      let totalNeeded = 1;
      let currentApprovals = 1;

      if (activeRule && ['APPROVED', 'REJECTED', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW', 'FINAL_SELECTION'].includes(decision)) {
        totalNeeded = activeRule.approvalsRequired || 1;
        
        let existingVote = await ApprovalRecord.findOne({
          where: { applicationId, hrUserId: userId, approvalStage }
        });
        
        if (existingVote) {
           existingVote.decision = decision;
           existingVote.reason = reason;
           existingVote.comments = comments;
           existingVote.status = decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
           await existingVote.save();
        } else {
           await ApprovalRecord.create({
             approvalId: `appr_${Date.now()}_${Math.random().toString(36).substring(2,8)}`,
             applicationId,
             hrUserId: userId,
             approvalStage,
             decision: decision,
             reason: reason,
             comments: comments,
             status: decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
             totalApprovalsNeeded: totalNeeded,
             reviewedAt: new Date(),
             approvedAt: new Date()
           });
        }
        
        const votes = await ApprovalRecord.findAll({
          where: { applicationId, approvalStage }
        });
        
        const positiveVotes = votes.filter(v => ['APPROVED', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW', 'FINAL_SELECTION'].includes(v.decision));
        const negativeVotes = votes.filter(v => v.decision === 'REJECTED');
        
        currentApprovals = positiveVotes.length;

        if (negativeVotes.length > 0 && decision === 'REJECTED') {
           quorumReached = true;
        } else if (positiveVotes.length < totalNeeded) {
           quorumReached = false;
        }
      }

      if (!quorumReached) {
        try {
          await ApplicationStatusLog.create({
            application_id: applicationId,
            previous_status: prevStatus,
            new_status: prevStatus,
            changed_by: userId,
            reason: `Vote recorded (${decision}): ${reason} [Quorum: ${currentApprovals}/${totalNeeded}]`
          });
        } catch (_) {}

        return res.status(200).json({
          success: true,
          message: `Approval recorded. Waiting for quorum (${currentApprovals}/${totalNeeded}).`,
          data: { applicationId, previousStatus: prevStatus, newStatus: prevStatus, decision, quorumPending: true }
        });
      }
      // --- QUORUM LOGIC END ---

      application.status = newStatus;
      application.hr_decision = decision;
      application.hr_notes = `${reason}${comments ? ` | ${comments}` : ''}`;

      if (decision === 'REQUEST_RE_INTERVIEW') {
        application.interview_score = null;
        const t = await sequelize.transaction();
        try {
          // Archive rather than delete — mark with a note since is_archived column doesn't exist
          await InterviewAnalysis.update(
            { scoring_rationale: sequelize.literal(`COALESCE(scoring_rationale, '') || ' [SUPERSEDED]'`) },
            { where: { application_id: applicationId }, transaction: t }
          );
          await InterviewSession.update({ status: 'CANCELLED' }, { where: { application_id: applicationId }, transaction: t });
          
          await InterviewSession.create({
            application_id: applicationId,
            status: 'SCHEDULED',
            interview_type: 'VIDEO',
            scheduled_at: new Date()
          }, { transaction: t });
          await t.commit();
          console.log(`[Re-Interview] Superseded interview data for application ${applicationId}`);
        } catch (cleanErr) {
          await t.rollback();
          console.error('Cleanup error in re-interview request:', cleanErr.message);
        }
      }
      if (decision === 'REQUEST_RE_ASSESSMENT') {
        application.technical_score = null;
        const t = await sequelize.transaction();
        try {
          const { AssessmentAnalysis, AssessmentAttempt } = require('../models');
          // Archive rather than delete
          await AssessmentAnalysis.update({ test_name: sequelize.literal(`test_name || ' (ARCHIVED)'`) }, { where: { application_id: applicationId }, transaction: t });
          await AssessmentAttempt.update(
            { status: 'SUPERSEDED' },
            { where: { application_id: applicationId }, transaction: t }
          );
          await t.commit();
          console.log(`[Re-Assessment] Superseded Assessment data for application ${applicationId}`);
        } catch (cleanErr) {
          await t.rollback();
          console.error('Assessment cleanup error:', cleanErr.message);
        }
      }

      // Handle Offer record creation for SEND_OFFER
      if (decision === 'SEND_OFFER') {
        const { OfferTemplate } = require('../models');
        const latestTemplate = await OfferTemplate.findOne({ order: [['createdAt', 'DESC']] });

        let templateContent = latestTemplate?.templateContent || `
          <div style="font-family: 'Times New Roman', serif; line-height: 1.5; color: #000;">
            <h2 style="text-align: center;">OFFER OF EMPLOYMENT</h2>
            <p>Dear {{candidateName}},</p>
            <p>We are pleased to offer you the position of <strong>{{jobTitle}}</strong> at AI Hiring System.</p>
            <p><strong>Salary:</strong> {{salary}}</p>
            <p><strong>Joining Date:</strong> {{joiningDate}}</p>
            <p>We look forward to having you join our team.</p>
            <p>Sincerely,<br/>HR Department</p>
          </div>
        `;

        // Replace Placeholders
        const candidateName = application.Candidate?.User?.name || 'Candidate';
        const jobTitle = req.body.designation || application.Job?.title || 'Professional';
        const salaryVal = `₹${(req.body.salary || 1000000).toLocaleString()}`;
        const joiningDateVal = new Date(req.body.joining_date || Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');

        templateContent = templateContent
          .replace(/{{candidateName}}/g, candidateName)
          .replace(/{{jobTitle}}/g, jobTitle)
          .replace(/{{salary}}/g, salaryVal)
          .replace(/{{joiningDate}}/g, joiningDateVal);

        // Delete existing offers for this application to avoid duplicates
        await Offer.destroy({ where: { application_id: applicationId } });

        await Offer.create({
          application_id: applicationId,
          salary: req.body.salary || 1000000,
          joining_date: req.body.joining_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          position_title: jobTitle,
          status: "PENDING",
          offer_letter_content: templateContent
        });
      }

      // Aggregate Score if moving to final
      if (decision === 'APPROVED' || decision === 'REJECTED') {
        application.overall_score = computeApplicationScore({
          resumeScore: application.resume_score,
          technicalScore: application.technical_score,
          interviewScore: application.interview_score,
          malpracticeWarnings: application.malpractice_warnings || 0
        });
      }

      await application.save();

      // Audit: HR decision
      await auditLogger.logHRDecision(req, {
        applicationId,
        decision,
        previousStatus: prevStatus,
        newStatus: application.status,
        reason,
      });

      // Log — non-fatal
      try {
        await ApplicationStatusLog.create({
          application_id: applicationId,
          previous_status: prevStatus,
          new_status: application.status,
          changed_by: userId,
          reason: `HR: ${decision} — ${reason}`,
        });
      } catch (_) { }

      // Notify — non-fatal
      const candidateId = application.Candidate?.id;
      if (candidateId) {
        const msgs = {
          APPROVED: { type: 'OFFER_LETTER_READY', title: 'Great News!', msg: 'Congratulations! You have been selected. Your offer letter will be ready soon.' },
          FINAL_SELECTION: { type: 'OFFER_LETTER_READY', title: 'Selected!', msg: 'You have been officially selected for the position. Congratulations!' },
          SEND_OFFER: { type: 'OFFER_LETTER_READY', title: 'Offer Letter Sent', msg: 'Your official offer letter has been sent to your email. Please review and respond.' },
          REJECTED: { type: 'REJECTION', title: 'Application Update', msg: 'Thank you for your time. While we were impressed, we have decided to move forward with other candidates.' },
          ON_HOLD: { type: 'OTHER', title: 'Application Update', msg: 'Your application is currently on hold/under review.' },
          REQUEST_RE_INTERVIEW: { type: 'INTERVIEW_SCHEDULED', title: 'Interview Follow-up', msg: 'A re-interview has been requested. Please check your schedule.' },
          SEND_TO_ASSESSMENT: { type: 'ASSESSMENT_AVAILABLE', title: 'Assessment Ready', msg: 'Your application has been approved for the technical assessment round.' },
          APPROVE_FOR_INTERVIEW: { type: 'INTERVIEW_AVAILABLE', title: 'Interview Ready', msg: 'Your application has been approved for the AI Interview round.' },
          REQUEST_RE_ASSESSMENT: { type: 'ASSESSMENT_AVAILABLE', title: 'Re-Assessment Requested', msg: 'HR has requested a technical re-assessment. Please check the portal.' },
        };
        const config = msgs[decision];
        try {
          await NotificationQueue.create({
            candidate_id: candidateId,
            application_id: application.id,
            notification_type: config?.type || 'OTHER',
            title: config?.title || 'Status Update',
            message: config?.msg || 'Your application status has been updated.',
            status: 'PENDING',
            metadata: {
              jobTitle: application.Job?.title,
              candidateName: application.Candidate?.User?.name,
              salary: req.body.salary || 1000000,
              joining_date: req.body.joining_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              position: req.body.designation || application.Job?.title
            }
          });
        } catch (err) {
          console.error("Failed to queue notification:", err.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Decision recorded: ${decision}`,
        data: { applicationId, previousStatus: prevStatus, newStatus: application.status, decision, ai_recommendation: decision === 'APPROVED' ? 'HIRE' : 'REVIEW' }
      });

    } catch (error) {
      // Audit failure log
      await auditLogger.log({
        actionType: "HR_DECISION",
        userId: String(req.user?.id ?? "UNKNOWN"),
        userRole: req.user?.role ?? "HR",
        entityType: "Application",
        entityId: String(applicationId),
        description: `HR decision FAILED for application #${applicationId}: ${error.message}`,
        ipAddress: auditLogger.resolveIP(req),
        userAgent: req.headers?.["user-agent"],
        status: "FAILURE",
      });
      console.error('Error making decision:', error);
      return res.status(500).json({ success: false, message: 'Error making decision' });
    }
  }

  /**
   * GET /hr/approvals/:applicationId
   */
  static async getPendingApprovals(req, res) {
    try {
      const { applicationId } = req.params;

      if (!applicationId || applicationId === 'undefined') {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User }] }]
      });
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const { HRApprovalRule, ApprovalRecord } = require('../models');
      const getStageMapping = (status) => {
        if (['APPLIED', 'RESUME_SUBMITTED', 'RESUME_EVALUATED'].includes(status)) return { approval: 'RESUME_REVIEW', rule: 'RESUME' };
        if (status.includes('ASSESSMENT') || status.includes('TECHNICAL')) return { approval: 'TECHNICAL_REVIEW', rule: 'TECHNICAL' };
        if (status.includes('INTERVIEW')) return { approval: 'INTERVIEW_REVIEW', rule: 'INTERVIEW' };
        return { approval: 'FINAL_DECISION', rule: 'FINAL' };
      };
      
      const { approval: approvalStage, rule: ruleStage } = getStageMapping(application.status);
      const activeRule = await HRApprovalRule.findOne({ where: { stage: ruleStage, isActive: true } });
      const totalNeeded = activeRule ? (activeRule.approvalsRequired || 1) : 1;
      
      const votes = await ApprovalRecord.findAll({
        where: { applicationId, approvalStage },
        include: [{ model: User, as: 'reviewer', attributes: ['name', 'email'] }]
      });
      
      const positiveVotes = votes.filter(v => ['APPROVED', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW', 'FINAL_SELECTION'].includes(v.decision));

      return res.status(200).json({
        success: true,
        data: {
          applicationId,
          candidateName: application.Candidate?.User?.name || 'N/A',
          currentStatus: application.status,
          totalNeeded,
          received: positiveVotes.length,
          isLocked: FINAL_STATES.includes(application.status),
          allApprovals: votes.map(v => ({
            reviewer: v.reviewer?.name || 'HR Reviewer',
            decision: v.decision,
            reason: v.reason,
            timestamp: v.reviewedAt,
            order: v.approvalOrder
          }))
        }
      });

    } catch (error) {
      console.error('Error fetching approvals:', error);
      return res.status(500).json({ success: false, message: 'Error fetching approvals' });
    }
  }

  /**
   * POST /hr/escalate/:applicationId
   */
  static async escalateDecision(req, res) {
    try {
      const { applicationId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      if (!applicationId || applicationId === 'undefined') {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      const application = await Application.findByPk(applicationId);
      if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

      const prevStatus = application.status;
      application.hr_notes = `ESCALATED by User#${userId}: ${reason}`;
      await application.save();

      // Audit: escalation
      await auditLogger.logApprovalFlow(req, {
        applicationId,
        stage: application.status,
        approvalDecision: "ESCALATED",
        hrUserId: userId,
      });

      try {
        await ApplicationStatusLog.create({
          application_id: applicationId, previous_status: prevStatus,
          new_status: application.status, changed_by: userId, reason: `Escalation: ${reason}`,
        });
      } catch (_) { }

      return res.status(200).json({ success: true, message: 'Escalated to senior HR', data: { applicationId } });

    } catch (error) {
      console.error('Error escalating:', error);
      return res.status(500).json({ success: false, message: 'Error escalating' });
    }
  }

  /**
   * POST /hr/request-reinterview/:applicationId
   */
  static async requestReInterview(req, res) {
    try {
      const { applicationId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      if (!applicationId || applicationId === 'undefined') {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User }] }]
      });
      if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

      const prevStatus = application.status;
      application.status = 'INTERVIEW_UNLOCKED';
      application.hr_decision = 'REQUEST_RE_INTERVIEW';
      application.hr_notes = reason;
      application.interview_score = null;
      await application.save();

      // Clear ALL old interview data for a truly fresh start
      try {
        await InterviewAnalysis.destroy({ where: { application_id: applicationId } });
        // Destroy ALL sessions (including COMPLETED) — candidate re-does interview from scratch
        await InterviewSession.destroy({ where: { application_id: applicationId } });
        // Create a fresh scheduled session
        await InterviewSession.create({
          application_id: applicationId,
          status: 'SCHEDULED',
          interview_type: 'VIDEO',
          scheduled_at: new Date()
        });
        console.log(`[Re-Interview] All interview data cleared for app ${applicationId}`);
      } catch (e) {
        console.error("Cleanup error in re-interview request:", e.message);
      }


      try {
        await ApplicationStatusLog.create({
          application_id: applicationId, previous_status: prevStatus,
          new_status: application.status, changed_by: userId, reason: `Re-interview: ${reason}`,
        });
      } catch (_) { }

      const candidateId = application.Candidate?.id;
      if (candidateId) {
        try {
          await NotificationQueue.create({
            candidate_id: candidateId,
            application_id: application.id,
            notification_type: 'INTERVIEW_SCHEDULED',
            title: 'Re-Interview Requested',
            message: 'A re-interview has been requested for your application. Please check the portal for details.',
            status: 'PENDING'
          });
        } catch (_) { }
      }

      return res.status(200).json({ success: true, message: 'Re-interview requested', data: { applicationId, newStatus: application.status } });

    } catch (error) {
      console.error('Error requesting re-interview:', error);
      return res.status(500).json({ success: false, message: 'Error requesting re-interview' });
    }
  }

  /**
   * POST /hr/re-evaluate-assessment/:applicationId
   */
  static async reEvaluateAssessment(req, res) {
    try {
      const { applicationId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const application = await Application.findByPk(applicationId);
      if (!application) return res.status(404).json({ success: false, message: 'Application not found' });

      const prevStatus = application.status;
      application.status = 'ASSESSMENT_UNLOCKED';
      application.technical_score = null;
      application.hr_decision = 'REQUEST_RE_ASSESSMENT';
      await application.save();

      // Destroy old AI analysis so fresh data is shown after re-assessment
      try {
        const { AssessmentAnalysis } = require('../models');
        const deleted = await AssessmentAnalysis.destroy({ where: { application_id: applicationId } });
        console.log(`[Re-Assessment] Deleted ${deleted} AssessmentAnalysis records for app ${applicationId}`);
      } catch (e) {
        console.error('AssessmentAnalysis cleanup error:', e.message);
      }

      await AssessmentAttempt.update(
        { status: 'NOT_STARTED', score: null, answers: null, submitted_at: null, ai_score: null, structure_score: null, concept_coverage: null, final_score: null, ai_feedback: null, metadata: null },
        { where: { application_id: applicationId } }
      );


      try {
        await ApplicationStatusLog.create({
          application_id: applicationId,
          previous_status: prevStatus,
          new_status: 'ASSESSMENT_UNLOCKED',
          changed_by: userId,
          reason: `Re-assessment requested: ${reason || 'N/A'}`
        });
      } catch (_) { }

      return res.status(200).json({ success: true, message: 'Assessment reset for re-evaluation' });
    } catch (error) {
      console.error('Error in reEvaluateAssessment:', error);
      return res.status(500).json({ success: false, message: 'Error resetting assessment' });
    }
  }

  /**
   * GET /hr/approval-rules
   */
  static async getApprovalRules(req, res) {
    try {
      const { HRApprovalRule } = require('../models');
      const rules = await HRApprovalRule.findAll({
        where: { isActive: true },
        order: [['stage', 'ASC']]
      });
      return res.status(200).json({ success: true, data: rules });
    } catch (error) {
      console.error('Error fetching approval rules:', error);
      return res.status(500).json({ success: false, message: 'Error fetching approval rules' });
    }
  }

  /**
   * POST /hr/applications/:applicationId/decide
   * Module 4: Integrated Decision Core
   */
  static async triggerAIDecision(req, res) {
    try {
      const { applicationId } = req.params;
      const application = await Application.findByPk(applicationId, {
        include: [
          { model: AssessmentAttempt, as: 'assessment_attempts', required: false },
          { model: InterviewSession, as: 'interview_sessions', required: false },
          { model: Job },
          { model: Candidate, include: [{ model: User }] }
        ]
      });

      if (!application) return res.status(404).json({ error: "Application not found" });

      const malpracticeCount = await MalpracticeEvent.count({ where: { application_id: applicationId } });
      const integrityScore = Math.max(0, 100 - (malpracticeCount * 10));

      const aiResponse = await aiService.getFinalCandidateDecision({
        assessmentScore: application.technical_score || 0,
        interviewScore: application.interview_score || 0,
        integrityScore,
        behavioralScore: application.behavioral_score || 50,
        resumeScore: application.resume_score || 0,
        jobTitle: application.Job?.title || "Target Role",
        candidateName: application.Candidate?.User?.name || "Candidate"
      });

      const successProb = typeof aiResponse.success_prediction_percentage === 'number'
        ? aiResponse.success_prediction_percentage / 100
        : 0.5;

      await application.update({
        final_decision: aiResponse.decision || 'Borderline',
        role_recommendation: aiResponse.role_recommendation || 'Standard capacity',
        fit_breakdown: aiResponse.fit_breakdown || { technical: 50, communication: 50, leadership: 50 },
        ai_rationale: aiResponse.reasoning || 'Automated evaluation based on performance benchmarks.',
        success_probability: successProb,
        overall_score: aiResponse.final_score || 50,
        integrity_score: integrityScore
      });

      res.json({ success: true, decision: aiResponse });

    } catch (err) {
      console.error("[Decision Core] Error:", err);
      res.status(500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  }

  /**
   * GET /hr/applications/:applicationId/benchmark
   * Module 5: Performance Benchmarking
   */
  static async getBenchmarkData(req, res) {
    try {
      const { applicationId } = req.params;
      const application = await Application.findByPk(applicationId);
      const peers = await Application.findAll({ where: { job_id: application.job_id, status: 'SELECTED' }, limit: 5 });

      const peerAvg = peers.length > 0 ? peers.reduce((s, a) => s + a.overall_score, 0) / peers.length : 70;

      res.json({
        success: true,
        data: {
          candidate_score: application.overall_score,
          peer_average: Math.round(peerAvg),
          percentile: application.overall_score > peerAvg ? 85 : 45,
          recommendation: application.overall_score > peerAvg ? "Exceeds peer benchmark" : "Matches peer baseline"
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = HRDecisionController;
