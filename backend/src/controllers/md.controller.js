const { Op } = require("sequelize");
const {
  Application,
  Candidate,
  Job,
  TechnicalRound,
  Offer,
  MalpracticeEvent,
  User,
  Notification,
  ResumeAnalysis
} = require("../models");
const { buildAssetUrl } = require('../utils/urlHelper');

// 🔥 AI Recommendation Logic
function getRecommendation(score, malpracticeScore) {
  if (malpracticeScore >= 8) return "REJECT";

  if (score >= 80) return "STRONGLY_RECOMMENDED";
  if (score >= 60) return "RECOMMENDED";
  if (score >= 40) return "AVERAGE";

  return "REJECT";
}

async function getMalpracticeScore(application_id) {
  const events = await MalpracticeEvent.findAll({
    where: { application_id }
  });

  return events.reduce((sum, e) => sum + e.severity, 0);
}

// ─── Post-interview statuses that MD should see ───────────────────────────────
const MD_VISIBLE_STATUSES = [
  "RECOMMENDED_BY_AI",
  "HR_REVIEW",
  "PROCEED_TO_HR",
  "INTERVIEW_COMPLETED",
  "OFFER_SENT",
  "SELECTED",
  "REJECTED",
  "OFFERED",
  "HIRED"
];

// 📊 MAIN API — only post-interview candidates
exports.getMDApplications = async (req, res) => {
  try {
    const { AssessmentAnalysis, InterviewAnalysis } = require("../models");
    
    const applications = await Application.findAll({
      where: {
        status: { [Op.in]: MD_VISIBLE_STATUSES }
      },
      attributes: [
        'id', 'overall_score', 'status', 'applied_at',
        'resume_score', 'technical_score', 'interview_score',
        'skills', 'education', 'specialization', 'experience_years',
        'summary', 'cgpa', 'year_of_passout'
      ],
      include: [
        {
          model: Candidate,
          attributes: [
            'id', 'experience_years', 'candidate_type', 'domain',
            'area_of_interest', 'current_company', 'working_address',
            'resume_path', 'profile_image_path'
          ],
          include: [{ model: User, attributes: ['name', 'email'] }]
        },
        { model: Job, attributes: ['title', 'department'] },
        { model: TechnicalRound, attributes: ['score', 'status'] },
        { model: MalpracticeEvent, attributes: ['severity'] },
        { model: AssessmentAnalysis, attributes: ['strengths', 'weaknesses'] },
        { model: InterviewAnalysis, attributes: ['detailed_evaluation', 'hire_recommendation'] },
        { model: ResumeAnalysis, attributes: ['skills', 'experience', 'education', 'analysis_explanation'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const enriched = applications.map((app) => {
      const score = app.overall_score || 0;
      const malpracticeScore = (app.MalpracticeEvents || []).reduce((sum, e) => sum + (e.severity || 0), 0);
      const recommendation = getRecommendation(score, malpracticeScore);

      // Map pros/cons from analyses
      const assessment = app.AssessmentAnalysis;
      const pros = Array.isArray(assessment?.strengths) ? assessment.strengths : [];
      const cons = Array.isArray(assessment?.weaknesses) ? assessment.weaknesses : [];

      const resumeAnalysis = app.ResumeAnalysis;

      return {
        ...app.toJSON(),
        applicationId: app.id,
        candidateName: app.Candidate?.User?.name || 'Unknown',
        candidateEmail: app.Candidate?.User?.email || '',
        profileImage: buildAssetUrl(app.Candidate?.profile_image_path),
        jobTitle: app.Job?.title || 'N/A',
        department: app.Job?.department || '',
        aiScore: app.overall_score || 0,
        applicationStatus: app.status,
        candidate: {
          name: app.Candidate?.User?.name || 'Unknown',
          email: app.Candidate?.User?.email || '',
          phone: app.Candidate?.phone || '',
          location: app.Candidate?.location || '',
          experience_years: app.Candidate?.experience_years || app.experience_years || 0,
          candidate_type: app.Candidate?.candidate_type || null,
          domain: app.Candidate?.domain || null,
          area_of_interest: app.Candidate?.area_of_interest || null,
          current_company: app.Candidate?.current_company || null,
          working_address: app.Candidate?.working_address || null,
          profile_image_path: app.Candidate?.profile_image_path || null,
        },
        profile: {
          education: app.education || '',
          specialization: app.specialization || '',
          skills: app.skills || [],
          summary: app.summary || '',
          cgpa: app.cgpa || null,
          year_of_passout: app.year_of_passout || null,
        },
        resumeParsed: resumeAnalysis ? {
          skills_extracted: resumeAnalysis.skills || [],
          experience_summary: resumeAnalysis.experience || '',
          education_details: resumeAnalysis.education || '',
          overall_assessment: resumeAnalysis.analysis_explanation || '',
        } : null,
        interviewAnalysis: app.InterviewAnalysis ? {
          detailed_evaluation: app.InterviewAnalysis.detailed_evaluation || '',
          hire_recommendation: app.InterviewAnalysis.hire_recommendation || '',
        } : null,
        score: app.overall_score || 0,
        ai_recommendation: recommendation,
        malpracticeScore,
        AIDecision: {
          pros: pros,
          cons: cons,
          ai_decision: recommendation,
          score: score
        }
      };
    });

    res.json(enriched);

  } catch (err) {
    console.error("MD Applications Fetch Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ MD Decision — recommendation to HR (not final selection)
exports.mdDecision = async (req, res) => {
  try {
    const { application_id, decision, md_notes } = req.body;

    const app = await Application.findByPk(application_id, {
      include: [
        {
          model: Candidate,
          include: [{ model: User, attributes: ['name', 'email'] }]
        },
        { model: Job, attributes: ['title'] }
      ]
    });

    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    const candidateName = app.Candidate?.User?.name || 'Unknown Candidate';
    const jobTitle = app.Job?.title || 'N/A';
    const mdName = req.user?.name || 'MD User';

    if (decision === "APPROVED") {
      app.final_decision = "MD_RECOMMENDED";
      app.status = "HR_REVIEW"; // Send back to HR for final selection
    } else {
      app.final_decision = "MD_REJECTED";
      app.status = "HR_REVIEW"; // Send back to HR for final review
    }

    // Store MD metadata
    app.md_notes = md_notes || null;
    app.md_decision_date = new Date();
    app.md_user_name = mdName;

    await app.save();

    // Create notification for HR
    const decisionWord = decision === "APPROVED" ? "recommended" : "rejected";
    const notificationMessage = `MD ${decisionWord} candidate ${candidateName} for ${jobTitle}`;

    await Notification.create({
      message: notificationMessage,
      role: "HR",
      is_read: false
    });

    res.json({
      message: `Recommendation submitted successfully`,
      candidateName,
      decision: decision,
      mdDecision: decision === "APPROVED" ? "MD_RECOMMENDED" : "MD_REJECTED",
      app
    });

  } catch (err) {
    console.error("MD Decision Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 📋 Get MD Decisions for HR dashboard (enriched data)
exports.getMDDecisions = async (req, res) => {
  try {
    // Fetch applications that have been decided by MD
    const decided = await Application.findAll({
      where: {
        final_decision: { [Op.in]: ['APPROVED', 'REJECTED', 'MD_RECOMMENDED', 'MD_REJECTED'] }
      },
      attributes: [
        'id', 'status', 'final_decision', 'overall_score', 'updated_at',
        'md_notes', 'md_decision_date', 'md_user_name',
        'skills', 'education', 'specialization', 'experience_years', 'summary',
        'resume_url'
      ],
      include: [
        {
          model: Candidate,
          attributes: ['id', 'experience_years', 'candidate_type', 'domain', 'resume_path'],
          include: [{ model: User, attributes: ['name', 'email'] }]
        },
        { model: Job, attributes: ['title', 'department'] },
        { model: ResumeAnalysis, attributes: ['skills', 'experience', 'education', 'analysis_explanation'] }
      ],
      order: [['md_decision_date', 'DESC'], ['updated_at', 'DESC']],
      limit: 50
    });

    const decisions = decided.map(app => {
      // Normalize decision labels for display
      const rawDecision = app.final_decision;
      const isRecommended = rawDecision === 'APPROVED' || rawDecision === 'MD_RECOMMENDED';
      const displayDecision = isRecommended ? 'RECOMMENDED' : 'REJECTED';

      return {
        applicationId: app.id,
        candidateName: app.Candidate?.User?.name || 'Unknown',
        candidateEmail: app.Candidate?.User?.email || '',
        jobTitle: app.Job?.title || 'N/A',
        department: app.Job?.department || '',
        decision: displayDecision,
        rawDecision: rawDecision,
        aiScore: app.overall_score || 0,
        decidedAt: app.md_decision_date || app.updated_at,
        mdNotes: app.md_notes || null,
        mdName: app.md_user_name || 'MD',
        currentStatus: app.status,
        candidateProfile: {
          education: app.education || '',
          specialization: app.specialization || '',
          skills: app.skills || [],
          experience_years: app.experience_years || app.Candidate?.experience_years || 0,
          summary: app.summary || '',
          candidate_type: app.Candidate?.candidate_type || '',
          domain: app.Candidate?.domain || '',
          hasResume: !!(app.Candidate?.resume_path || app.resume_url),
        },
        resumeAnalysis: app.ResumeAnalysis ? {
          skills: app.ResumeAnalysis.skills || [],
          experience: app.ResumeAnalysis.experience || '',
          education: app.ResumeAnalysis.education || '',
          assessment: app.ResumeAnalysis.analysis_explanation || '',
        } : null,
      };
    });

    res.json({ success: true, data: decisions });

  } catch (err) {
    console.error("MD Decisions Fetch Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getTopCandidates = async (req, res) => {
  try {
    const applications = await Application.findAll({
      where: {
        status: { [Op.in]: MD_VISIBLE_STATUSES }
      },
      attributes: ['id', 'overall_score'],
      include: [
        { model: Candidate, attributes: ['id'], include: [{ model: User, attributes: ['name'] }] },
        { model: Job, attributes: ['title'] }
      ]
    });

    const ranked = applications
      .map(app => ({
        id: app.id,
        candidateName: app.Candidate?.User?.name || 'Unknown',
        jobTitle: app.Job?.title || 'N/A',
        aiScore: app.overall_score || 0
      }))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 5);

    res.json(ranked);

  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const total = await Application.count();

    // Align with global status enums
    const selected = await Application.count({
      where: { 
        status: { 
          [Op.in]: ['SELECTED', 'HIRED'] 
        } 
      }
    });

    const rejected = await Application.count({
      where: { 
        status: { 
          [Op.in]: ['REJECTED'] 
        } 
      }
    });

    // Analytics based on overall score
    const high = await Application.count({ where: { overall_score: { [Op.gte]: 80 } } });
    const medium = await Application.count({ where: { overall_score: { [Op.between]: [50, 79] } } });
    const low = await Application.count({ where: { overall_score: { [Op.lt]: 50 } } });

    const scoreDistribution = { high, medium, low };

    // Pipeline count for MD (post-interview only)
    const pendingReview = await Application.count({
      where: { status: { [Op.in]: ['INTERVIEW_COMPLETED', 'RECOMMENDED_BY_AI', 'HR_REVIEW'] } }
    });

    const totalApplications = await Application.count({
      where: { status: { [Op.in]: MD_VISIBLE_STATUSES } }
    });

    const avgScore = await Application.findOne({
      where: { status: { [Op.in]: MD_VISIBLE_STATUSES } },
      attributes: [[require("sequelize").fn('AVG', require("sequelize").col('overall_score')), 'avg']],
      raw: true
    });

    // Funnel Data
    const applied = total;
    const screened = await Application.count({ where: { status: { [Op.notIn]: ['APPLIED', 'REJECTED'] } } });
    const assessment = await Application.count({ where: { status: { [Op.in]: ['TECHNICAL_ROUND_COMPLETED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_IN_PROGRESS', 'INTERVIEW_COMPLETED', 'RECOMMENDED_BY_AI', 'PROCEED_TO_HR', 'HR_REVIEW', 'SELECTED', 'OFFER_SENT', 'HIRED'] } } });
    const interview = pendingReview + selected + rejected; // Approximation for passed assessment

    const funnel = [
      { stage: "Applied", count: applied },
      { stage: "Screened", count: screened },
      { stage: "Assessment", count: assessment },
      { stage: "Interview", count: interview },
      { stage: "Selected", count: selected },
    ];

    // Department Mix
    const { Job } = require('../models');
    const deptApps = await Application.findAll({
      attributes: [],
      include: [{
        model: Job,
        attributes: ['department']
      }]
    });

    const deptCounts = {};
    deptApps.forEach(app => {
      const dept = app.Job?.department || 'General';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    
    const departments = Object.keys(deptCounts).map(name => ({
      name,
      value: deptCounts[name]
    }));

    // Trend Data (Last 6 months)
    const trendData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);

      const monthApps = await Application.count({
        where: { created_at: { [Op.between]: [start, end] } }
      });
      const monthHires = await Application.count({
        where: { 
          created_at: { [Op.between]: [start, end] },
          status: { [Op.in]: ['SELECTED', 'HIRED', 'OFFER_SENT'] }
        }
      });

      trendData.push({
        month: d.toLocaleString('default', { month: 'short' }),
        apps: monthApps,
        hires: monthHires
      });
    }

    res.json({
      total,
      totalApplications,
      selected,
      rejected,
      pendingReview,
      shortlisted: pendingReview + selected,
      avgAiScore: avgScore?.avg || 0,
      offerRate: total > 0 ? ((selected / total) * 100) : 0,
      selectionRate: total > 0 ? ((selected / total) * 100).toFixed(1) : "0.0",
      scoreDistribution,
      funnel,
      departments,
      trendData
    });

  } catch (err) {
    console.error("MD Analytics Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};