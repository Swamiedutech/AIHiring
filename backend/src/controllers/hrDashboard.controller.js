const { Application, Candidate, User, Job, HRInternalNote } = require('../models');
const { Op } = require('sequelize');
const { STATUS_GROUPS } = require('../utils/applicationStatus.utils');
const { buildAssetUrl } = require('../utils/urlHelper');

class HRDashboardController {

  /**
   * GET /hr/dashboard/kpi
   */
  static async getKPICards(req, res) {
    try {
      const [totalCandidates, pendingReview, selected, rejected, selectedApps] = await Promise.all([
        Candidate.count(),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.pendingReview } } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.shortlisted } } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.rejected } } }),
        Application.findAll({ where: { status: { [Op.in]: STATUS_GROUPS.shortlisted } }, attributes: ['applied_at', 'created_at', 'updated_at'] }),
      ]);

      const avgTimeToHire = selectedApps.length > 0
        ? Math.round(selectedApps.reduce((acc, app) => {
            const start = app.applied_at || app.created_at;
            return acc + Math.floor((new Date(app.updated_at) - new Date(start)) / 86400000);
          }, 0) / selectedApps.length)
        : 36; // Fallback to baseline if no selected apps yet

      return res.status(200).json({
        success: true,
        data: { totalCandidates, pendingReview, selected, rejected, avgTimeToHire }
      });
    } catch (error) {
      console.error('Error fetching KPI cards:', error);
      return res.status(500).json({ success: false, message: 'Error fetching KPI data' });
    }
  }

  /**
   * GET /hr/dashboard/funnel
   */
  static async getHiringFunnel(req, res) {
    try {
      const stages = STATUS_GROUPS.funnel;

      const statusCounts = await Application.findAll({
        attributes: ['status', [Application.sequelize.fn('COUNT', Application.sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true
      });

      const countMap = {};
      statusCounts.forEach(c => countMap[c.status] = parseInt(c.count, 10));

      const funnelData = stages.map(s => {
        let count = 0;
        s.statuses.forEach(status => count += countMap[status] || 0);
        return { stage: s.key, count };
      });

      const combined = funnelData.map((item, i, arr) => {
        const prev    = i === 0 ? item.count : arr[i - 1].count;
        const dropoff = prev > 0 ? Math.round((1 - item.count / prev) * 100) : 0;
        return { ...item, dropoff };
      });

      return res.status(200).json({ success: true, data: combined });
    } catch (error) {
      console.error('Error fetching funnel:', error);
      return res.status(500).json({ success: false, message: 'Error fetching funnel' });
    }
  }

  /**
   * GET /hr/dashboard/distribution
   */
  static async getStatusDistribution(req, res) {
    try {
      const groups = [
        { label: 'Under Review',     statuses: ['RESUME_EVALUATED', 'TECHNICAL_ROUND_COMPLETED', 'INTERVIEW_COMPLETED'] },
        { label: 'Approval Pending', statuses: STATUS_GROUPS.pendingReview },
        { label: 'Selected',         statuses: STATUS_GROUPS.shortlisted },
        { label: 'Rejected',         statuses: STATUS_GROUPS.rejected },
        { label: 'In Progress',      statuses: ['ASSESSMENT_UNLOCKED', 'TECHNICAL_ROUND_IN_PROGRESS', 'INTERVIEW_UNLOCKED', 'INTERVIEW_IN_PROGRESS', 'INTERVIEW_SCHEDULED', 'RE_INTERVIEW_REQUESTED'] },
      ];

      const distribution = await Promise.all(
        groups.map(async g => ({
          label: g.label,
          value: await Application.count({ where: { status: { [Op.in]: g.statuses } } })
        }))
      );

      return res.status(200).json({ success: true, data: distribution });
    } catch (error) {
      console.error('Error fetching distribution:', error);
      return res.status(500).json({ success: false, message: 'Error fetching distribution' });
    }
  }

  /**
   * GET /hr/dashboard/skills-heatmap  (also mapped as getSkillGap in routes)
   */
  static async getSkillGap(req, res) {
    try {
      const applications = await Application.findAll({
        where: { status: { [Op.notIn]: STATUS_GROUPS.rejected } },
        attributes: ['resume_score', 'technical_score', 'interview_score'],
        limit: 100,
        order: [['created_at', 'DESC']],
      });

      const tally = [
        { skill: 'Resume',    strong: 0, average: 0, weak: 0 },
        { skill: 'Technical', strong: 0, average: 0, weak: 0 },
        { skill: 'Interview', strong: 0, average: 0, weak: 0 },
      ];

      const bucket = (slot, score) => {
        if (!score) return;
        if (score >= 70)      slot.strong++;
        else if (score >= 40) slot.average++;
        else                  slot.weak++;
      };

      applications.forEach(app => {
        bucket(tally[0], app.resume_score);
        bucket(tally[1], app.technical_score);
        bucket(tally[2], app.interview_score);
      });

      return res.status(200).json({ success: true, data: tally });
    } catch (error) {
      console.error('Error fetching skill gap:', error);
      return res.status(500).json({ success: false, message: 'Error fetching skill gap' });
    }
  }

  /**
   * GET /hr/dashboard/pending-actions
   */
  static async getPendingActions(req, res) {
    try {
      const applications = await Application.findAll({
        where: { status: { [Op.in]: ['APPLIED', 'RESUME_SUBMITTED', ...STATUS_GROUPS.pendingReview, 'RE_INTERVIEW_REQUESTED'] } },
        attributes: ['id', 'status', 'updated_at'],
        include: [
          { 
            model: Candidate, 
            attributes: ['id'],
            include: [{ model: User, attributes: ['name'] }] 
          }, 
          { model: Job, attributes: ['title'] }
        ],
        order: [['updated_at', 'ASC']],
        limit: 20,
      });

      const actions = applications.map(app => {
        const hoursInReview = Math.round((Date.now() - new Date(app.updated_at).getTime()) / 3600000);
        const daysWaiting = Math.max(0, Math.floor((Date.now() - new Date(app.updated_at).getTime()) / 86400000));
        const hoursRemaining = Math.max(0, 24 - hoursInReview);
        return {
          _id:            String(app.id),
          candidateName:  app.Candidate?.User?.name || 'N/A',
          jobTitle:       app.Job?.title || 'N/A',
          action:         app.status,
          daysWaiting,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          urgency: hoursRemaining < 2 ? 'CRITICAL' : hoursRemaining < 8 ? 'HIGH' : 'MEDIUM',
        };
      });

      return res.status(200).json({ success: true, data: actions });
    } catch (error) {
      console.error('Error fetching pending actions:', error);
      return res.status(500).json({ success: false, message: 'Error fetching pending actions' });
    }
  }

  /**
   * GET /hr/dashboard/ai-vs-hr
   */
  static async getAIvsHRComparison(req, res) {
    try {
      const { timeframe = 'month' } = req.query;
      const days  = { week: 7, month: 30, quarter: 90 }[timeframe] || 30;
      const since = new Date(Date.now() - days * 86400000);

      const applications = await Application.findAll({
        where: { created_at: { [Op.gte]: since } },
        attributes: ['hr_decision', 'overall_score', 'created_at', 'status'],
      });

      const byMonth = {};
      applications.forEach(app => {
        const month = new Date(app.created_at).toLocaleString('default', { month: 'short' });
        if (!byMonth[month]) byMonth[month] = { month, aiDecisions: 0, hrDecisions: 0 };
        const aiPositive = (app.overall_score || 0) >= 60 || 
          ['RECOMMENDED_BY_AI', 'SELECTED', 'HR_REVIEW'].includes(app.status);
        if (aiPositive) byMonth[month].aiDecisions++;
        if (app.hr_decision && ['APPROVED', 'SELECTED', 'SEND_TO_ASSESSMENT', 'APPROVE_FOR_INTERVIEW'].includes(app.hr_decision)) {
          byMonth[month].hrDecisions++;
        }
      });

      const total   = applications.length;
      const aligned = applications.filter(app => {
        const aiPos = (app.overall_score || 0) >= 60;
        const hrPos = !!app.hr_decision && app.hr_decision !== 'REJECTED';
        return aiPos === hrPos;
      }).length;

      return res.status(200).json({
        success: true,
        data: {
          chartData: Object.values(byMonth),
          alignmentRate: total > 0 ? Math.round((aligned / total) * 100) : 0,
          totalDecisions: total,
        }
      });
    } catch (error) {
      console.error('Error fetching AI vs HR:', error);
      return res.status(500).json({ success: false, message: 'Error fetching comparison' });
    }
  }

  /**
   * GET /hr/dashboard/overview
   */
  static async getDashboardOverview(req, res) {
    try {
      const [totalActive, pendingReview, selected, rejected] = await Promise.all([
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.active } } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.pendingReview } } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.shortlisted } } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.rejected } } }),
      ]);

      const pendingApps = await Application.findAll({
        where: { status: { [Op.in]: STATUS_GROUPS.pendingReview } },
        attributes: ['id', 'status'],
        include: [
          { 
            model: Candidate, 
            attributes: ['id'],
            include: [{ model: User, attributes: ['name'] }] 
          },
          { model: Job, attributes: ['title'] }
        ],
        order: [['updated_at', 'ASC']], limit: 5,
      });

      return res.status(200).json({
        success: true,
        data: {
          kpis: { totalActive, pendingReview, selected, rejected },
          pendingActions: pendingApps.map(app => ({
            id: app.id,
            candidateName: app.Candidate?.User?.name || 'N/A',
            stage: app.status, position: app.Job?.title || 'N/A',
          })),
          lastUpdated: new Date(),
        }
      });
    } catch (error) {
      console.error('Error fetching overview:', error);
      return res.status(500).json({ success: false, message: 'Error fetching overview' });
    }
  }

  /**
   * GET /hr/dashboard/time-to-hire
   */
  static async getTimeToHirePerRole(req, res) {
     try {
       const selectedApps = await Application.findAll({
         where: { status: { [Op.in]: STATUS_GROUPS.shortlisted } },
         include: [{ model: Job, attributes: ['title'] }],
         attributes: ['applied_at', 'created_at', 'updated_at']
       });

       const roleTime = {};
       selectedApps.forEach(app => {
          const role = app.Job?.title || 'General';
          if (!roleTime[role]) roleTime[role] = { totalDays: 0, count: 0 };
          const start = app.applied_at || app.created_at;
          const days = Math.floor((new Date(app.updated_at) - new Date(start)) / 86400000);
          roleTime[role].totalDays += days;
          roleTime[role].count += 1;
       });

       const data = Object.keys(roleTime).map(role => ({
          role,
          days: Math.round(roleTime[role].totalDays / roleTime[role].count)
       }));

       return res.status(200).json({ success: true, data });
     } catch (error) {
       console.error('Error fetching time to hire:', error);
       return res.status(500).json({ success: false, message: 'Error fetching time to hire' });
     }
  }

  /**
   * GET /hr/dashboard/rejection-reasons
   */
  static async getRejectionReasons(req, res) {
     try {
       const rejections = await Application.findAll({
          where: { status: { [Op.in]: STATUS_GROUPS.rejected } },
          attributes: ['hr_notes', 'overall_score', 'technical_score', 'interview_score', 'resume_score']
       });

       let reasons = {
          "Salary Expectations": 0,
          "Technical Skills": 0,
          "Culture Fit": 0,
          "Resume Shortlist Failed": 0,
          "Offer Declined": 0,
          "Other": 0
       };

       rejections.forEach(app => {
          const notes = (app.hr_notes || "").toLowerCase();
          if (notes.includes("salary") || notes.includes("ctc") || notes.includes("expectation")) {
             reasons["Salary Expectations"]++;
          } else if (app.technical_score > 0 && app.technical_score < 50) {
             reasons["Technical Skills"]++;
          } else if (app.resume_score > 0 && app.resume_score < 40) {
             reasons["Resume Shortlist Failed"]++;
          } else if (notes.includes("culture") || notes.includes("fit") || (app.interview_score > 0 && app.interview_score < 50)) {
             reasons["Culture Fit"]++;
          } else if (notes.includes("decline") || notes.includes("reject offer")) {
             reasons["Offer Declined"]++;
          } else {
             reasons["Other"]++;
          }
       });

       const data = Object.keys(reasons).filter(k => reasons[k] > 0).map(k => ({
          name: k, value: reasons[k]
       }));

       return res.status(200).json({ success: true, data });
     } catch (error) {
       console.error('Error fetching rejection reasons:', error);
       return res.status(500).json({ success: false, message: 'Error fetching reasons' });
     }
  }

  /**
   * GET /hr/dashboard/operational-core
   */
  static async getOperationalCore(req, res) {
    try {
      let internalDiscussions = 0;
      try {
        internalDiscussions = await HRInternalNote.count();
      } catch (_) { internalDiscussions = 0; }

      const recentApps = await Application.findAll({
        where: { updated_at: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } },
        attributes: ['hr_decision', 'updated_at', 'created_at', 'status']
      });

      const actionedWithinSLA = recentApps.filter(app => {
        const daysSinceUpdate = (Date.now() - new Date(app.updated_at).getTime()) / 86400000;
        return app.hr_decision || daysSinceUpdate <= 3;
      }).length;

      const slaEfficiency = recentApps.length > 0
        ? Math.round((actionedWithinSLA / recentApps.length) * 100)
        : 100;

      return res.status(200).json({
        success: true,
        data: { internalDiscussions, slaEfficiency }
      });
    } catch (error) {
      console.error('Error fetching operational core:', error);
      return res.status(500).json({ success: false, message: 'Error fetching operational core' });
    }
  }

  /**
   * GET /hr/dashboard/top-candidates
   */
  static async getTopCandidates(req, res) {
    try {
      const applications = await Application.findAll({
        where: {
          overall_score: { [Op.gt]: 0 },
          status: { [Op.notIn]: STATUS_GROUPS.rejected }
        },
        attributes: ['id', 'overall_score', 'status', 'resume_score', 'technical_score', 'interview_score'],
        include: [
          {
            model: Candidate,
            attributes: ['id', 'integrity_score', 'profile_image_path'],
            include: [{ model: User, attributes: ['name', 'email'] }]
          },
          { model: Job, attributes: ['title', 'department'] }
        ],
        order: [['overall_score', 'DESC']],
        limit: 5
      });

      const ranked = applications.map((app, i) => ({
        rank: i + 1,
        applicationId: app.id,
        name: app.Candidate?.User?.name || 'Unknown',
        email: app.Candidate?.User?.email || '',
        profileImage: buildAssetUrl(app.Candidate?.profile_image_path),
        job: app.Job?.title || 'N/A',
        department: app.Job?.department || '',
        score: app.overall_score || 0,
        resumeScore: app.resume_score || 0,
        technicalScore: app.technical_score || 0,
        interviewScore: app.interview_score || 0,
        integrityScore: app.Candidate?.integrity_score || 100,
        status: app.status
      }));

      return res.status(200).json({ success: true, data: ranked });
    } catch (error) {
      console.error('Error fetching top candidates:', error);
      return res.status(500).json({ success: false, message: 'Error fetching top candidates' });
    }
  }

  /**
   * GET /hr/dashboard/recent-hires
   */
  static async getRecentHires(req, res) {
    try {
      const applications = await Application.findAll({
        where: {
          status: 'HIRED'
        },
        attributes: ['id', 'status', 'updated_at'],
        include: [
          {
            model: Candidate,
            attributes: ['id', 'profile_image_path'],
            include: [{ model: User, attributes: ['name', 'email'] }]
          },
          { model: Job, attributes: ['title', 'department'] }
        ],
        order: [['updated_at', 'DESC']],
        limit: 5
      });

      const recentHires = applications.map(app => ({
        id: app.id,
        name: app.Candidate?.User?.name || 'Unknown',
        email: app.Candidate?.User?.email || '',
        jobTitle: app.Job?.title || 'N/A',
        department: app.Job?.department || '',
        profileImage: buildAssetUrl(app.Candidate?.profile_image_path),
        hiredAt: app.updated_at
      }));

      return res.status(200).json({ success: true, data: recentHires });
    } catch (error) {
      console.error('Error fetching recent hires:', error);
      return res.status(500).json({ success: false, message: 'Error fetching recent hires' });
    }
  }
}

module.exports = HRDashboardController;
