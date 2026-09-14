const {
  Application,
  TechnicalRound,
  Notification,
  Candidate,
  Job,
  User,
  MCQTest,
  AssessmentAttempt,
  AssessmentAnalysis,
  InterviewSession
} = require("../models");
const emailService = require("../services/email.service");
const { buildAssetUrl } = require('../utils/urlHelper');

/* =============================
   GET ALL APPLICATIONS
============================= */
exports.getAllApplications = async (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 20 } = req.query;
    const { Op } = require("sequelize");

    let where = {};
    let jobWhere = {};
    let candidateWhere = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (role && role !== 'all') {
      jobWhere.title = role;
    }

    if (search) {
      candidateWhere['$User.name$'] = { [Op.iLike]: `%${search}%` };
    }

    const offset = (page - 1) * limit;

    const { count: totalCount, rows: applications } = await Application.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        { 
          model: Candidate, 
          where: Object.keys(candidateWhere).length > 0 ? candidateWhere : undefined,
          include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] 
        },
        { model: Job, where: Object.keys(jobWhere).length > 0 ? jobWhere : undefined },
        { model: TechnicalRound, attributes: ['score'] },
        { model: AssessmentAnalysis, attributes: ['overall_score'] },
        { model: InterviewSession, as: 'interview_session', attributes: ['overall_score'] }
      ],
      order: [["created_at", "DESC"]],
      distinct: true
    });

    const { computeApplicationScore } = require('../utils/applicationStatus.utils');
    const { AIConfig } = require("../models");

    // Fetch all active AI configs
    const aiConfigs = await AIConfig.findAll({ where: { status: 'ACTIVE' }, raw: true });
    const aiConfigMap = {};
    aiConfigs.forEach(config => {
      aiConfigMap[config.jobId] = config;
    });
    
    // Deduplicate applications by ID to prevent React duplicate key errors
    const uniqueApplications = [];
    const seenIds = new Set();
    
    for (const app of applications) {
      if (!seenIds.has(app.id)) {
        uniqueApplications.push(app);
        seenIds.add(app.id);
      }
    }

    const mapped = uniqueApplications.map(app => {
      const j = app.toJSON();
      
      const jobIdStr = String(j.job_id || (j.Job && j.Job.id));
      const configForJob = aiConfigMap[jobIdStr];

      let customWeights = null;
      if (configForJob) {
        customWeights = {
           resume: configForJob.resumeWeight || 0.3,
           technical: configForJob.technicalWeight || 0.4,
           interview: configForJob.interviewWeight || 0.3
        };
      }

      // Calculate real-time aggregate score using all available data
      const realTimeScore = computeApplicationScore({
        overallScore: j.overall_score,
        resumeScore: j.resume_score,
        technicalScore: j.TechnicalRound?.score || j.AssessmentAnalysis?.overall_score || j.technical_score,
        interviewScore: j.interview_session?.overall_score || j.interview_score,
        malpracticeWarnings: j.malpractice_warnings || 0,
        customWeights
      });

      return {
        ...j,
        _id: String(j.id),
        // normalize to camelCase for frontend
        candidateId: j.Candidate ? {
          _id: String(j.Candidate.id),
          name: j.Candidate.User?.name,
          email: j.Candidate.User?.email,
          profileImage: buildAssetUrl(j.Candidate.profile_image_path),
        } : j.candidate_id,
        jobId: j.Job ? {
          _id: String(j.Job.id),
          title: j.Job.title,
          department: j.Job.department,
        } : j.job_id,
        stage: j.status,
        aiScore: realTimeScore, // Using real-time calculated score
        appliedAt: j.applied_at,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
        resumeUrl: j.resume_url,
        skills: j.skills,
        cgpa: j.cgpa,
        yearOfPassout: j.year_of_passout,
      };
    });

    res.json({
      success: true,
      count: mapped.length, // Items in current page
      total: totalCount, // Total items matching query
      totalPages: Math.ceil(totalCount / limit),
      currentPage: parseInt(page),
      data: mapped
    });
  } catch (err) {
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/* =============================
   GET ASSESSMENT STATS
============================= */
exports.getAssessmentStats = async (req, res) => {
  try {
    const { AssessmentAttempt, Application, Job, Candidate, User } = require('../models');
    const { sequelize } = require('../config/db');

    // 1. KPI Stats
    const totalCount = await AssessmentAttempt.count();
    const completedCount = await AssessmentAttempt.count({ where: { status: 'EVALUATED' } });
    const inProgressCount = await AssessmentAttempt.count({ where: { status: 'IN_PROGRESS' } });
    
    const avgScoreResult = await AssessmentAttempt.findOne({
      attributes: [[sequelize.fn('AVG', sequelize.col('final_score')), 'avgScore']],
      where: { status: 'EVALUATED' }
    });
    const avgScore = avgScoreResult?.get('avgScore') || 0;

    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    // 2. Top Assessments (Group by Job Title)
    const topAssessments = await AssessmentAttempt.findAll({
      attributes: [
        [sequelize.literal('"Application->Job"."title"'), 'jobTitle'],
        [sequelize.fn('COUNT', sequelize.col('AssessmentAttempt.id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('final_score')), 'avgScore']
      ],
      include: [{
        model: Application,
        attributes: [],
        include: [{ model: Job, attributes: [] }]
      }],
      group: [sequelize.literal('"Application->Job"."title"')],
      order: [[sequelize.fn('COUNT', sequelize.col('AssessmentAttempt.id')), 'DESC']],
      limit: 5,
      raw: true
    });

    // 3. Recent Activities
    const recentActivities = await AssessmentAttempt.findAll({
      include: [{
        model: Application,
        include: [
          { model: Job, attributes: ['title'] },
          { model: Candidate, include: [{ model: User, attributes: ['name'] }] }
        ]
      }],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    // 4. Performance Trends (Mock for now but structured)
    const performanceData = [
      { name: "Week 1", avgScore: Math.round(avgScore), completionRate: Math.round(completionRate), candidates: totalCount },
      { name: "Week 2", avgScore: 72, completionRate: 80, candidates: totalCount + 5 },
      { name: "Week 3", avgScore: 70, completionRate: 85, candidates: totalCount + 10 },
      { name: "Current", avgScore: 78, completionRate: 78, candidates: totalCount + 15 },
    ];

    res.json({
      success: true,
      data: {
        kpis: {
          total: totalCount,
          completed: completedCount,
          inProgress: inProgressCount,
          avgScore: Math.round(avgScore),
          completionRate: Math.round(completionRate)
        },
        topAssessments: topAssessments.map(ta => ({
          name: ta.jobTitle || 'General Assessment',
          count: parseInt(ta.count),
          avgScore: Math.round(parseFloat(ta.avgScore || 0))
        })),
        recentActivities: recentActivities.map(act => ({
          name: act.Application?.Candidate?.User?.name || 'Unknown',
          action: act.status === 'EVALUATED' ? 'completed' : 'started',
          task: act.Application?.Job?.title || 'Technical Assessment',
          score: act.final_score ? `${act.final_score}%` : null,
          time: act.created_at,
          img: act.Application?.Candidate?.profile_image_path 
            ? buildAssetUrl(act.Application.Candidate.profile_image_path)
            : `/images/default-avatar.png`
        })),
        performanceData
      }
    });

  } catch (error) {
    console.error('Error fetching assessment stats:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get applications ready for interview scheduling
 */
exports.getReadyForInterview = async (req, res) => {
  try {
    const { Application, Candidate, User, Job, InterviewSession } = require('../models');
    const { Op } = require('sequelize');

    const applications = await Application.findAll({
      where: {
        status: { [Op.in]: [
          'INTERVIEW_UNLOCKED', 
          'HR_REVIEW', 
          'PROCEED_TO_HR', 
          'RE_INTERVIEW_REQUESTED', 
          'RECOMMENDED_BY_AI', 
          'TECHNICAL_ROUND_COMPLETED'
        ] }
      },
      include: [
        { model: Job, attributes: ['title'] },
        { 
          model: Candidate, 
          include: [{ model: User, attributes: ['name', 'email'] }] 
        },
        {
          model: InterviewSession,
          as: 'interview_sessions',
          required: false,
          where: { status: { [Op.ne]: 'CANCELLED' } }
        }
      ]
    });

    // Filter out applications that already have an active session
    // Exception: If status is RE_INTERVIEW_REQUESTED, we allow scheduling even if a COMPLETED session exists
    const readyApps = applications.filter(app => {
      if (app.status === 'RE_INTERVIEW_REQUESTED') {
        // Only block if there's a currently SCHEDULED or IN_PROGRESS session
        const hasCurrentActive = (app.interview_sessions || []).find(s => ['SCHEDULED', 'IN_PROGRESS'].includes(s.status));
        return !hasCurrentActive;
      }
      
      const activeSession = (app.interview_sessions || []).find(s => ['SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED'].includes(s.status));
      return !activeSession;
    });

    res.json({
      success: true,
      data: readyApps.map(app => ({
        id: app.id,
        candidateName: app.Candidate?.User?.name || 'Unknown',
        candidateEmail: app.Candidate?.User?.email,
        jobTitle: app.Job?.title || 'Unknown',
        candidateId: app.candidate_id
      }))
    });
  } catch (error) {
    console.error('Error fetching ready for interview:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get full list of assessments with real-time stats
 * GET /hr/assessments/list
 */
exports.getAssessmentsList = async (req, res) => {
  try {
    const { Job, TechnicalQuestionBank, AssessmentAttempt, Application } = require('../models');
    const { sequelize } = require('../config/db');

    const jobs = await Job.findAll({
      attributes: [
        'id', 'title', 'department', 'status', 'created_at',
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('TechnicalQuestionBanks.questionId'))), 'questionCount']
      ],
      include: [
        {
          model: TechnicalQuestionBank,
          attributes: [],
          required: false
        }
      ],
      group: ['Job.id'],
      raw: true
    });

    const statsByJob = await AssessmentAttempt.findAll({
      attributes: [
        [sequelize.col('Application.job_id'), 'job_id'],
        [sequelize.fn('COUNT', sequelize.col('AssessmentAttempt.id')), 'totalCompleted'],
        [sequelize.fn('AVG', sequelize.col('final_score')), 'avgScore']
      ],
      include: [{
        model: Application,
        attributes: []
      }],
      where: { status: 'EVALUATED' },
      group: ['Application.job_id'],
      raw: true
    });

    const appsByJob = await Application.findAll({
      attributes: [
        'job_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalApps']
      ],
      group: ['job_id'],
      raw: true
    });

    const statsMap = {};
    statsByJob.forEach(s => { statsMap[s.job_id] = s; });
    
    const appsMap = {};
    appsByJob.forEach(a => { appsMap[a.job_id] = a; });

    const results = jobs.map((job) => {
      const stats = statsMap[job.id] || { totalCompleted: 0, avgScore: 0 };
      const totalApps = appsMap[job.id] ? parseInt(appsMap[job.id].totalApps) : 0;

      return {
        id: job.id,
        name: `${job.title} Assessment`,
        role: job.title,
        department: job.department,
        type: job.department === 'Engineering' || job.department === 'Technical' ? 'Technical' : 'Cognitive',
        questions: parseInt(job.questionCount || 0),
        duration: "45 min", // Mock or derived
        status: job.status === 'ACTIVE' ? 'Active' : 'Draft',
        completed: `${stats?.totalCompleted || 0}/${totalApps}`,
        score: stats?.avgScore ? `${Math.round(stats.avgScore)}%` : '-',
        icon: job.department === 'Technical' ? 'Zap' : 'Brain'
      };
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error listing assessments:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get specific assessment questions and answers
 * GET /hr/assessments/:jobId/details
 */
exports.getAssessmentDetails = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { TechnicalQuestionBank, Job } = require('../models');
    const { Op } = require('sequelize');

    const job = await Job.findByPk(jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });

    // Normalize job title to match ENUM jobRole if needed (e.g., "Management Trainee - Marketing" -> "MANAGEMENT_TRAINEE_MARKETING")
    const normalizedRole = job.title.toUpperCase().replace(/[\s-]+/g, '_').trim();

    const questions = await TechnicalQuestionBank.findAll({
      where: {
        [Op.or]: [
          { job_id: jobId },
          { jobRole: normalizedRole }
        ]
      },
      order: [['created_at', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        jobTitle: job.title,
        questions: questions.map(q => ({
          id: q.questionId,
          question: q.question,
          type: q.evaluation_type,
          difficulty: q.difficulty,
          topic: q.topic,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation || q.expected_answer
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching assessment details:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/* =============================
   HR SHORTLIST / REJECT
============================= */
exports.updateDecision = async (req, res) => {
  try {
    const { application_id, decision } = req.body;

    const application = await Application.findByPk(application_id, {
      include: [Candidate]
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    /* ===== UPDATE STATUS ===== */
    application.hr_decision = decision;
    application.status =
      decision === "SHORTLISTED" ? "TECHNICAL_ROUND" : "REJECTED";

    await application.save();

    /* ===== SHORTLIST FLOW ===== */
    if (decision === "SHORTLISTED") {
      /* ---- TECH ROUND ---- */
      const techRound = await TechnicalRound.findOne({
        where: { application_id }
      });

      if (!techRound) {
        await TechnicalRound.create({
          application_id,
          status: "PENDING"
        });
      }

      /* ---- MCQ TEST ---- */
      const mcq = await MCQTest.findOne({
        where: { application_id }
      });

      if (!mcq) {
        await MCQTest.create({
          application_id,
          total_questions: 10,
          duration_minutes: 30,
          status: "PENDING"
        });
      }

      /* ---- NOTIFICATION ---- */
      await Notification.create({
        user_id: application.Candidate.user_id,
        role: "CANDIDATE",
        message: "You have been shortlisted. Technical & MCQ rounds assigned."
      });
    }

    /* ===== REJECTION FLOW ===== */
    if (decision === "REJECTED") {
      await Notification.create({
        user_id: application.Candidate.user_id,
        role: "CANDIDATE",
        message: "Your application has been rejected."
      });
    }

    res.json({
      message: "Decision updated successfully",
      application
    });

  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/* =============================
   DASHBOARD SUMMARY
============================= */
exports.getDashboardSummary = async (req, res) => {
  try {
    const totalApplications = await Application.count();

    const shortlisted = await Application.count({
      where: { status: "TECHNICAL_ROUND" }
    });

    const rejected = await Application.count({
      where: { status: "REJECTED" }
    });

    const completedTechRounds = await TechnicalRound.count({
      where: { status: "COMPLETED" }
    });

    res.json({
      totalApplications,
      shortlisted,
      rejected,
      completedTechRounds
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/* =============================
   TECHNICAL ROUNDS VIEW
============================= */
exports.getTechnicalRounds = async (req, res) => {
  try {
    const rounds = await TechnicalRound.findAll({
      include: [
        {
          model: Application,
          include: [Candidate, Job]
        }
      ]
    });

    res.json(rounds);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/* =============================
   HR ACTION HANDLERS (NEW)
============================= */

/**
 * Send offer letter to candidate
 * POST /hr/send-offer/:applicationId
 */
exports.sendOfferLetter = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { salary, joining_date, designation } = req.body;

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, Job]
    });

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: "Application not found" 
      });
    }

    // Create offer record
    try {
      const { Offer } = require("../models");
      
      // Check if there's already an accepted offer
      const acceptedOffer = await Offer.findOne({
        where: { application_id: applicationId, status: ["ACCEPTED", "HIRED"] }
      });
      if (acceptedOffer) {
        return res.status(400).json({ success: false, message: "Cannot overwrite an accepted offer." });
      }

      // Archive existing pending offers instead of deleting to fix Issue #2
      await Offer.update({ status: 'SUPERSEDED' }, { where: { application_id: applicationId, status: 'PENDING' } });
      
      await Offer.create({
        application_id: applicationId,
        salary: salary || 1000000,
        joining_date: joining_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        position_title: designation || application.Job?.title,
        status: "PENDING"
      });
      console.log("✅ Offer record created for application:", applicationId);
    } catch (e) {
      console.error("❌ Offer creation failed:", e.message);
      // Don't swallow the error if it's important
      throw new Error("Failed to create offer record in database: " + e.message);
    }

    // Update application status
    application.status = "OFFER_SENT";
    await application.save();

    // Notify candidate
    try {
      // 1. In-app notification
      await Notification.create({
        user_id: application.Candidate.user_id,
        role: "CANDIDATE",
        message: `Congratulations! You have received an offer for ${application.Job?.title} position. Please check your email for details.`
      });

      // 2. Email Notification (Centralized)
      await emailService.sendOfferLetterEmail(
        application.Candidate.User.email,
        application.Candidate.User.name,
        application.Job?.title,
        salary,
        joining_date
      );

    } catch (e) {
      console.error("Selection notification/email failed:", e.message);
    }

    res.json({
      success: true,
      message: "Offer letter sent successfully",
      data: {
        applicationId,
        candidateName: application.Candidate?.name,
        candidateEmail: application.Candidate?.email,
        jobTitle: application.Job?.title,
        status: "OFFER_SENT"
      }
    });

  } catch (error) {
    console.error("Send offer error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error sending offer letter",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message 
    });
  }
};

/**
 * Send rejection email to candidate
 * POST /hr/send-rejection/:applicationId
 */
exports.sendRejectionEmail = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason } = req.body;

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, Job]
    });

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: "Application not found" 
      });
    }

    // Update application status
    application.status = "REJECTED";
    application.hr_notes = reason || application.hr_notes;
    await application.save();

    // Notify candidate
    try {
      // 1. In-app notification
      await Notification.create({
        user_id: application.Candidate.user_id,
        role: "CANDIDATE",
        message: `Thank you for your interest in ${application.Job?.title} position. Unfortunately, your application has not been selected to move forward at this time.`
      });

      // 2. Email Notification
      await emailService.sendRejectionEmail(
        application.Candidate.User.email,
        application.Candidate.User.name,
        application.Job?.title
      );

    } catch (e) {
      console.error("Rejection notification/email failed:", e.message);
    }

    res.json({
      success: true,
      message: "Rejection email sent successfully",
      data: {
        applicationId,
        candidateName: application.Candidate?.name,
        candidateEmail: application.Candidate?.email,
        status: "REJECTED"
      }
    });

  } catch (error) {
    console.error("Send rejection error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error sending rejection",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message 
    });
  }
};

/**
 * Schedule interview for candidate
 * POST /hr/schedule-interview/:applicationId
 */
exports.scheduleInterview = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { interview_date, interview_time, interviewer, interview_type } = req.body;

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, Job]
    });

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: "Application not found" 
      });
    }

    // Update application status
    application.status = "INTERVIEW_SCHEDULED";
    await application.save();

    // Store interview details
    try {
      const { InterviewSession } = require("../models");
      const scheduledDateTime = new Date(`${interview_date}T${interview_time}`);
      
      // Calculate 10 hour expiration
      const expiresAt = new Date(scheduledDateTime.getTime() + (10 * 60 * 60 * 1000));

      await InterviewSession.create({
        application_id: applicationId,
        candidate_id: application.candidate_id,
        scheduled_at: scheduledDateTime,
        expires_at: expiresAt,
        interviewer: interviewer || "AI Neural Core",
        interview_type: interview_type || "VIDEO",
        status: "SCHEDULED"
      });
    } catch (e) {
      console.log("Interview session creation failed:", e.message);
    }

    // Notify candidate
    try {
      // 1. Create legacy notification
      await Notification.create({
        user_id: application.Candidate.user_id,
        role: "CANDIDATE",
        message: `Your interview for ${application.Job?.title} has been scheduled for ${interview_date} at ${interview_time}. Interviewer: ${interviewer || 'HR Team'}`
      });

      // 2. Create modern NotificationQueue record for the candidate dashboard
      const { NotificationQueue } = require("../models");
      await NotificationQueue.create({
        candidate_id: application.candidate_id,
        application_id: applicationId,
        notification_type: "INTERVIEW_SCHEDULED",
        title: "Interview Scheduled",
        message: `Your interview for ${application.Job?.title} has been scheduled for ${interview_date} at ${interview_time}. Interviewer: ${interviewer || 'HR Team'}`,
        sent_via_email: true,
        status: "PENDING"
      });

      // 3. Send Email Notification
      if (application.Candidate?.User?.email) {
        const messageBody = `Hello ${application.Candidate.User.name},<br/><br/>Your interview for the <strong>${application.Job?.title}</strong> position has been successfully scheduled.<br/><br/><strong>Date:</strong> ${interview_date}<br/><strong>Time:</strong> ${interview_time}<br/><strong>Interviewer:</strong> ${interviewer || 'HR Team'}<br/><strong>Format:</strong> ${interview_type || 'VIDEO'}<br/><br/>Please log in to your Candidate Portal at the scheduled time to join the interview session. Make sure you have a working camera and microphone.`;
        
        await emailService.sendNotificationEmail(
          application.Candidate.User.email,
          "Interview Scheduled - AI Hiring System",
          messageBody,
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/candidate/interview`
        );
      }
    } catch (e) {
      console.log("Notification/Email failed:", e.message);
    }

    res.json({
      success: true,
      message: "Interview scheduled successfully",
      data: {
        applicationId,
        candidateName: application.Candidate?.name,
        candidateEmail: application.Candidate?.email,
        interviewDate: interview_date,
        interviewTime: interview_time,
        interviewer: interviewer || "HR Team",
        status: "INTERVIEW_SCHEDULED"
      }
    });

  } catch (error) {
    console.error("Schedule interview error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error scheduling interview",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message 
    });
  }
};

/**
 * Add internal note to application
 * POST /hr/add-note/:applicationId
 */
exports.addInternalNote = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { note } = req.body;
    const userId = req.user?.id;

    if (!note || !note.trim()) {
      return res.status(400).json({ 
        success: false,
        message: "Note content is required" 
      });
    }

    const application = await Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: "Application not found" 
      });
    }

    // Store internal note (if HRInternalNote model exists)
    try {
      const { HRInternalNote } = require("../models");
      const internalNote = await HRInternalNote.create({
        application_id: applicationId,
        added_by: userId,
        note_text: note,
        note_type: "GENERAL"
      });

      return res.json({
        success: true,
        message: "Note added successfully",
        data: {
          note_id: internalNote.id,
          applicationId,
          note: note,
          createdAt: internalNote.createdAt
        }
      });
    } catch (e) {
      console.error("Note creation error:", e);
      return res.status(500).json({
        success: false,
        message: "Error adding note",
        error: e.message
      });
    }

  } catch (error) {
    console.error("Add note error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error adding internal note",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message 
    });
  }
};

/* =============================
   INTERVIEW MANAGEMENT (NEW)
============================= */

/**
 * Get interview dashboard stats
 * GET /hr/interviews/stats
 */
exports.getInterviewStats = async (req, res) => {
  try {
    const { InterviewSession, Application, Candidate, User } = require('../models');
    const { sequelize } = require('../config/db');

    const totalCount = await InterviewSession.count();
    const completedCount = await InterviewSession.count({ where: { status: 'COMPLETED' } });
    const scheduledCount = await InterviewSession.count({ where: { status: 'SCHEDULED' } });
    const cancelledCount = await InterviewSession.count({ where: { status: 'CANCELLED' } });
    
    const avgScoreResult = await InterviewSession.findOne({
      attributes: [[sequelize.fn('AVG', sequelize.col('overall_score')), 'avgScore']],
      where: { status: 'COMPLETED' }
    });
    const avgScore = avgScoreResult?.get('avgScore') || 0;

    const distribution = await InterviewSession.findAll({
      attributes: ['hire_recommendation', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { status: 'COMPLETED' },
      group: ['hire_recommendation'],
      raw: true
    });

    const recentHighlights = await InterviewSession.findAll({
      where: { status: 'COMPLETED' },
      include: [{
        model: Application,
        include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }]
      }],
      order: [['created_at', 'DESC']],
      limit: 3
    });

    res.json({
      success: true,
      data: {
        kpis: {
          total: totalCount,
          completed: completedCount,
          scheduled: scheduledCount,
          cancelled: cancelledCount,
          avgScore: parseFloat(parseFloat(avgScore).toFixed(1))
        },
        distribution: distribution.map(d => ({
          name: d.hire_recommendation || 'PENDING',
          value: parseInt(d.count)
        })),
        highlights: recentHighlights.map(h => ({
          name: h.Application?.Candidate?.User?.name || 'Candidate',
          insight: h.ai_analysis?.overall_feedback || "Demonstrated strong technical potential and cultural alignment.",
          img: h.Application?.Candidate?.profile_image_path 
            ? buildAssetUrl(h.Application.Candidate.profile_image_path)
            : `/images/default-avatar.png`
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching interview stats:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get list of interviews for table
 * GET /hr/interviews/list
 */
exports.getInterviewsList = async (req, res) => {
  try {
    const { InterviewSession, Application, Job, Candidate, User } = require('../models');

    const interviews = await InterviewSession.findAll({
      include: [
        {
          model: Application,
          include: [
            { model: Job, attributes: ['title'] },
            { model: Candidate, include: [{ model: User, attributes: ['name', 'email'] }] }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    const results = interviews.map(i => ({
      id: i.id,
      candidate: i.Application?.Candidate?.User?.name || 'Unknown',
      candidateEmail: i.Application?.Candidate?.User?.email,
      role: i.Application?.Job?.title || 'Unknown',
      interviewer: 'AI Neural Core',
      round: 'Technical Round',
      type: i.interview_type,
      dateTime: i.scheduled_at || i.created_at,
      status: i.status,
      score: i.overall_score || '-',
      recommendation: i.hire_recommendation,
      img: buildAssetUrl(i.Application?.Candidate?.profile_image_path, "/images/default-avatar.png")
    }));

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error listing interviews:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get specific interview details and analysis
 * GET /hr/interviews/:id/details
 */
exports.getInterviewDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { InterviewSession, InterviewAnalysis, Application, Candidate, User, Job } = require('../models');

    const session = await InterviewSession.findByPk(id, {
      include: [
        {
          model: Application,
          include: [Job, { model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }]
        }
      ]
    });

    if (!session) return res.status(404).json({ success: false, message: "Interview session not found" });

    const analysis = await InterviewAnalysis.findOne({
      where: { application_id: session.application_id }
    });

    res.json({
      success: true,
      data: {
        session,
        analysis: analysis || null,
        qaPairs: analysis?.qa_pairs || session.answers_provided || [],
        candidate: {
          name: session.Application?.Candidate?.User?.name,
          email: session.Application?.Candidate?.User?.email,
          job_title: session.Application?.Job?.title,
          resume: buildAssetUrl(session.Application?.Candidate?.resume_path),
          profile_image: buildAssetUrl(session.Application?.Candidate?.profile_image_path, "/images/default-avatar.png")
        }
      }
    });
  } catch (error) {
    console.error('Error fetching interview details:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Update Application Status
 * PUT /hr/applications/:applicationId
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { Application } = require("../models");
    const { applicationId } = req.params;
    const { status } = req.body;

    const application = await Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    application.status = status;
    await application.save();

    return res.json({
      success: true,
      message: "Stage updated successfully"
    });
  } catch (error) {
    console.error("Update stage error:", error);
    return res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get Candidate Resume
 * GET /hr/resume/:applicationId
 */
exports.getResume = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { Application, Candidate } = require("../models");
    const path = require('path');
    const fs = require('fs');

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate, attributes: ["resume_path"] }]
    });

    if (!application || !application.Candidate?.resume_path) {
      return res.status(404).json({ success: false, message: "Resume not found for this candidate." });
    }

    const resumeRelPath = application.Candidate.resume_path;
    const absolutePath = path.join(__dirname, "../../", resumeRelPath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: "Resume file missing on server." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="resume_${applicationId}.pdf"`);
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    console.error("[Resume View] Error:", error.message);
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};
