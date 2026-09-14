const { Op } = require("sequelize");
const {
  Application,
  Candidate,
  NotificationQueue,
  ApplicationStatusLog,
  Job,
  ResumeAnalysis, // Added for auto-analysis
  sequelize
} = require("../models");
const aiService = require("../services/ai.service");
const logger = require("../utils/logger");


// FIX #10: only expose internal error details outside production
const isDev = process.env.NODE_ENV !== "production";

/**
 * ==========================================
 * APPLY FOR JOB
 * POST /applications/apply
 * ==========================================
 */
exports.applyJob = async (req, res) => {
  // FIX #1: Read all fields the frontend sends
  const { job_id, jobId, education, specialization, experience_years } = req.body;
  const targetJobId = job_id || jobId;

  if (!targetJobId) {
    return res.status(400).json({ message: "Job ID is required" });
  }
  const parsedJobId = parseInt(targetJobId, 10);
  if (isNaN(parsedJobId)) {
    return res.status(400).json({ message: "Job ID must be a valid number" });
  }

  // FIX #4: Wrap all writes in a transaction so no partial state is left on failure
  const t = await sequelize.transaction();

  try {
    const candidate = await Candidate.findOne({
      where: { user_id: req.user.id },
      transaction: t
    });

    if (!candidate) {
      await t.rollback();
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    if (!candidate.resume_path) {
      await t.rollback();
      return res.status(400).json({
        message: "Please upload your resume before applying"
      });
    }

    const job = await Job.findOne({
      where: { id: parsedJobId, status: "ACTIVE" },
      transaction: t
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({
        message: "Job not found or no longer active"
      });
    }

    const existingApplication = await Application.findOne({
      where: { job_id: parsedJobId, candidate_id: candidate.id },
      transaction: t
    });

    if (existingApplication) {
      await t.rollback();
      return res.status(409).json({
        message: "You have already applied for this job"
      });
    }

    // FIX #1: Persist the fields that the frontend sends (with profile fallbacks)
    const application = await Application.create(
      {
        candidate_id: candidate.id,
        job_id: parsedJobId,
        status: "APPLIED",
        applied_at: new Date(),
        education: (education || candidate.education || "Not specified").trim(),
        specialization: (specialization || candidate.specialization || "General").trim(),
        experience_years: experience_years !== undefined ? Number(experience_years) : (candidate.experience_years || 0),
        resume_url: candidate.resume_path,
        skills: candidate.skills || [],
        cgpa: candidate.cgpa || null,
        year_of_passout: candidate.year_of_passout || null
      },
      { transaction: t }
    );

    await ApplicationStatusLog.create(
      {
        application_id: application.id,
        previous_status: null,
        new_status: "APPLIED",
        changed_at: new Date(),
        metadata: {
          source: "Candidate Panel",
          job_title: job.title || null
        }
      },
      { transaction: t }
    );

    try {
      await NotificationQueue.create({
        candidate_id: candidate.id,
        notification_type: "APPLICATION_RECEIVED",
        title: "Application Submitted",
        message: `You have successfully applied for ${job.title}`,
      }, { transaction: t });
    } catch (err) {
      console.error("Notification failed:", err.message);
    }

    await t.commit();

    // ========== ASYNC AUTO-ANALYSIS TRIGGER (NON-BLOCKING) ==========
    // We trigger this after commit so the application ID is definitely available
    setImmediate(async () => {
      try {
        logger.info(`[Auto-Analysis] Triggering automatic AI analysis for application ${application.id}`);
        const path = require('path');
        const absolutePath = path.join(__dirname, '../../', candidate.resume_path);
        
        const aiParsedData = await aiService.parseResumeWithAI(absolutePath);
        
        let jdScores = { overall_fit_percentage: 0, matched_skills: [], missing_skills: [] };
        if (job) {
          const jobRequirements = {
            title: job.title,
            description: job.description,
            required_skills: job.required_skills || [],
            min_experience: job.min_experience || 0
          };
          jdScores = await aiService.scoreResume(aiParsedData, jobRequirements);
        }

        // Create Analysis Record
        await ResumeAnalysis.create({
          application_id: application.id,
          resume_id: 0,
          contact_info: aiParsedData.contact_info || {},
          education: aiParsedData.education || [],
          experience: aiParsedData.experience || [],
          total_years_experience: aiParsedData.experience_years || 0, // FIXED MAPPING
          skills: aiParsedData.skills || {},
          ai_summary: aiParsedData.summary || 'AI parsed profile',
          strengths: aiParsedData.strengths || [],
          weaknesses: aiParsedData.weaknesses || [],
          overall_score: aiParsedData.overall_score || 0,
          jd_match_score: jdScores.overall_fit_percentage || 0,
          jd_matched_skills: jdScores.matched_skills || [],
          jd_missing_skills: jdScores.missing_skills || [],
          role_fit: aiParsedData.role_fit || {}
        });


        // Update application with final scores
        await application.update({
          resume_score: Math.round(jdScores.overall_fit_percentage || aiParsedData.overall_score || 0),
          skills: jdScores.matched_skills || []
        });

        logger.info(`[Auto-Analysis] Completed successfully for app ${application.id}`);
      } catch (err) {
        logger.error(`[Auto-Analysis] Failed for app ${application.id}: ${err.message}`);
      }
    });

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      application_id: application.id
    });

  } catch (error) {
    await t.rollback();
    console.error("Apply job error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit application",
      // FIX #10: never leak internal error details in production
      ...(isDev && { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message })
    });
  }
};


/**
 * ==========================================
 * GET MY APPLICATIONS (Dashboard)
 * GET /applications/my
 * ==========================================
 */
exports.getMyApplications = async (req, res) => {
  // FIX #9: Support pagination via query params (default: page 1, 20 per page)
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  try {
    const candidate = await Candidate.findOne({
      where: { user_id: req.user.id }
    });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const { count, rows: applications } = await Application.findAndCountAll({
      where: { candidate_id: candidate.id },
      include: [
        {
          model: Job,
          // FIX #6: include company_name so the frontend can render it
          attributes: ["id", "title", "department", "company_name", "status"]
        }
      ],
      order: [["created_at", "DESC"]],
      // FIX #9: apply pagination
      limit,
      offset
    });

    // FIX #2: Match the shape the frontend CandidateDashboard actually uses
    const formatted = applications.map(app => ({
      id: app.id,               // was "application_id" — frontend uses app.id
      status: app.status,
      applied_at: app.applied_at,
      education: app.education,
      experience_years: app.experience_years,
      // Expose as app.Job so CandidateDashboard's app.Job?.title works
      Job: {
        id: app.Job?.id,
        title: app.Job?.title,
        department: app.Job?.department,
        company_name: app.Job?.company_name  // FIX #6
      }
    }));

    return res.json({
      success: true,
      applications: formatted,
      // FIX #9: return pagination metadata
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error("Get my applications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      ...(isDev && { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message })  // FIX #10
    });
  }
};


/**
 * ==========================================
 * GET SINGLE APPLICATION DETAILS
 * GET /applications/:applicationId
 * ==========================================
 */
exports.getApplicationDetails = async (req, res) => {
  const { applicationId } = req.params;

  // FIX #5: Validate applicationId type before querying
  const parsedId = parseInt(applicationId, 10);
  if (isNaN(parsedId)) {
    return res.status(400).json({ message: "Invalid application ID" });
  }

  try {
    const candidate = await Candidate.findOne({
      where: { user_id: req.user.id }
    });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const application = await Application.findOne({
      where: {
        id: parsedId,
        candidate_id: candidate.id
      },
      include: [
        {
          model: Job,
          // FIX #7: restrict to safe public-facing attributes only
          attributes: ["id", "title", "department", "company_name", "location", "description", "required_skills"]
        },
        {
          model: ApplicationStatusLog,
          attributes: ["previous_status", "new_status", "changed_at", "metadata"]
        }
      ],
      // FIX #3: order must be a top-level option referencing the associated model,
      // not nested inside include — Sequelize silently ignores order inside include
      order: [[ApplicationStatusLog, "changed_at", "ASC"]]
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    return res.json({
      success: true,
      application: {
        id: application.id,
        status: application.status,
        applied_at: application.applied_at,
        education: application.education,
        specialization: application.specialization,
        experience_years: application.experience_years,
        job: application.Job,
        timeline: application.ApplicationStatusLogs
      }
    });

  } catch (error) {
    console.error("Get application details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch application details",
      ...(isDev && { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message })  // FIX #10
    });
  }
};

/**
 * AUTO-REJECTION ENGINE
 * Triggered when all three scores are available (resume, assessment, interview)
 * Automatically rejects candidates with final score < 40
 * Called from: resume.controller, assessment.controller, interview.controller
 */
exports.checkAndTriggerAutoRejection = async (applicationId, logger = console) => {
  try {
    const application = await Application.findByPk(applicationId);

    if (!application) {
      logger?.warn(`[Auto-Rejection] Application ${applicationId} not found`);
      return;
    }

    const { resume_score, technical_score, interview_score, status } = application;

    logger?.info(`[Auto-Rejection] Checking scores for app ${applicationId}: resume=${resume_score}, technical=${technical_score}, interview=${interview_score}`);

    // Only proceed if ALL THREE scores are available
    if (resume_score === null || technical_score === null || interview_score === null) {
      logger?.info(`[Auto-Rejection] Not all scores available yet - skipping`);
      return;
    }

    // Skip if already in terminal state
    if (['AUTO_REJECTED', 'OFFERED', 'REJECTED', 'REJECTED_BY_CANDIDATE'].includes(status)) {
      logger?.info(`[Auto-Rejection] Application already in terminal state: ${status}`);
      return;
    }

    // Calculate final weighted score
    const finalScore = Math.round(
      (resume_score * 0.3) + (technical_score * 0.4) + (interview_score * 0.3)
    );

    logger?.info(`[Auto-Rejection] Final score: ${finalScore} (formula: resume×0.3=${resume_score * 0.3} + technical×0.4=${technical_score * 0.4} + interview×0.3=${interview_score * 0.3})`);

    let newStatus = status;
    let shouldNotify = false;

    // THRESHOLD 1: Move to review if score < 40 (Previously AUTO-REJECT)
    if (finalScore < 40) {
      newStatus = 'HR_REVIEW';
      shouldNotify = false;
      logger?.warn(`[Review] Score ${finalScore} < 40 - Moving to HR_REVIEW for manual consideration (AUTO-REJECT DISABLED)`);
    }
    // THRESHOLD 2: Strong recommendation if score >= 60
    else if (finalScore >= 60) {
      newStatus = 'RECOMMENDED_BY_AI';
      logger?.info(`[Auto-Rejection] ✅ RECOMMENDATION: Score ${finalScore} >= 60 - Application recommended for HR interview`);
    }
    // THRESHOLD 3: Proceed to HR review for 40-60 range
    else {
      newStatus = 'PROCEED_TO_HR';
      logger?.info(`[Auto-Rejection] 🔄 REVIEW: Score ${finalScore} between 40-60 - Application needs HR review`);
    }

    // Update application with final score and decision
    const t = await sequelize.transaction();
    try {
      await application.update(
        {
          overall_score: finalScore,
          status: newStatus,
          updated_at: new Date()
        },
        { transaction: t }
      );

      // Log the status change with reason
      await ApplicationStatusLog.create(
        {
          application_id: applicationId,
          previous_status: status,
          new_status: newStatus,
          changed_by: 'SYSTEM_AUTO_REJECTION',
          changed_at: new Date(),
          metadata: {
            reason: 'Auto-rejection engine',
            final_score: finalScore,
            resume_score,
            technical_score,
            interview_score,
            calculation: `(${resume_score} × 0.3) + (${technical_score} × 0.4) + (${interview_score} × 0.3)`
          }
        },
        { transaction: t }
      );

      await t.commit();
      logger?.info(`[Auto-Rejection] ✅ Status updated to: ${newStatus} with score: ${finalScore}`);

      // 📢 QUEUE NOTIFICATION (Asynchronous via worker)
      try {
        const { NotificationQueue, Candidate, User, Job } = require("../models");
        const appWithUser = await Application.findByPk(applicationId, {
          include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, { model: Job }]
        });

        if (appWithUser && appWithUser.Candidate) {
          let title = "Application Update";
          let message = "Your application status has been updated. Please check the portal.";
          let type = "OTHER";

          if (newStatus === 'RECOMMENDED_BY_AI') {
            title = "Great News! Recommended for next stage";
            message = `Congratulations! Your assessment performance for ${appWithUser.Job?.title} has been rated as Strong. Our team will review your dossier shortly.`;
            type = "RECOMMENDATION";
          } else if (newStatus === 'PROCEED_TO_HR') {
            title = "Assessment Completed - Under Review";
            message = `Thank you for completing the assessments for ${appWithUser.Job?.title}. Your results are being reviewed by our recruitment team.`;
          }

          await NotificationQueue.create({
            candidate_id: appWithUser.Candidate.id,
            application_id: applicationId,
            notification_type: type,
            title,
            message,
            status: 'PENDING',
            metadata: {
              jobTitle: appWithUser.Job?.title,
              finalScore: finalScore,
              candidateName: appWithUser.Candidate.User?.name
            }
          });
        }
      } catch (notifyErr) {
        logger?.error(`[Auto-Rejection] Failed to queue notification: ${notifyErr.message}`);
      }

    } catch (dbError) {
      await t.rollback();
      logger?.error(`[Auto-Rejection] Database error: ${dbError.message}`);
      throw dbError;
    }

  } catch (error) {
    logger?.error(`[Auto-Rejection] Check failed: ${error.message}`);
    // Don't throw - this function should not break the main flow
  }
};