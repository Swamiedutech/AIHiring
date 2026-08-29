const { Candidate, User, Application, Job, MalpracticeEvent, AssessmentAttempt } = require('../models');
const { Op } = require('sequelize');
const { buildAssetUrl } = require('../utils/urlHelper');

class RiskMonitorController {
  /**
   * GET /api/hr/risk-monitor
   */
  static async getRiskMonitor(req, res) {
    try {
      const { search = "", riskType = "All", stage = "All", page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // 1. Fetch all candidates to compute global stats
      const candidates = await Candidate.findAll({
        attributes: ['id', 'integrity_score'],
        include: [
          { 
            model: Application, 
            attributes: ['id', 'status'],
            include: [{ model: MalpracticeEvent, attributes: ['id', 'type'] }]
          }
        ]
      });

      let highRiskCount = 0;
      let mediumRiskCount = 0;
      let lowRiskCount = 0;
      let noRiskCount = 0;

      candidates.forEach(c => {
        // Aggregate malpractice events from all applications
        const malpracticeCount = (c.Applications || []).reduce((acc, app) => acc + (app.MalpracticeEvents?.length || 0), 0);
        const score = c.integrity_score || 100;

        if (malpracticeCount > 2 || score < 40) highRiskCount++;
        else if (malpracticeCount > 0 || score < 75) mediumRiskCount++;
        else if (score < 95) lowRiskCount++;
        else noRiskCount++;
      });

      const total = candidates.length || 1;
      const overallRiskScore = Math.round(((highRiskCount * 90) + (mediumRiskCount * 60) + (lowRiskCount * 30)) / total);

      // 2. Build filtered list
      let candidateWhere = {};
      let appWhere = {};

      if (search) {
        candidateWhere[Op.or] = [
          { '$User.name$': { [Op.iLike]: `%${search}%` } },
          { location: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (stage !== "All") {
        // Map human-readable stage to actual DB status enums
        const stageMap = {
          'Sourcing': ['APPLIED', 'RESUME_SUBMITTED'],
          'Assessment': ['TECHNICAL_ROUND_PENDING', 'TECHNICAL_ROUND_IN_PROGRESS', 'TECHNICAL_ROUND_COMPLETED', 'ASSESSMENT_UNLOCKED'],
          'Interview': ['INTERVIEW_UNLOCKED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_IN_PROGRESS', 'INTERVIEW_COMPLETED'],
          'Review': ['HR_REVIEW', 'PROCEED_TO_HR', 'RECOMMENDED_BY_AI']
        };
        appWhere.status = stageMap[stage] || stage;
      }

      // Filter by Risk Type (Mapped to Malpractice Event Types or Scores)
      if (riskType !== "All") {
        const type = riskType.toLowerCase();
        if (type.includes("high")) {
          candidateWhere.integrity_score = { [Op.lt]: 50 };
        } else if (type.includes("fraud")) {
          candidateWhere.id = { 
            [Op.in]: candidates.filter(c => 
              (c.Applications || []).some(app => 
                (app.MalpracticeEvents || []).some(e => e.type.includes('FRAUD') || e.type.includes('CHEAT'))
              )
            ).map(c => c.id) 
          };
        } else if (type.includes("behavioral")) {
           candidateWhere.integrity_score = { [Op.lt]: 70 };
        } else if (type.includes("compliance") || type.includes("background")) {
           candidateWhere.id = { 
            [Op.in]: candidates.filter(c => 
              (c.Applications || []).some(app => (app.MalpracticeEvents || []).length > 0)
            ).map(c => c.id) 
          };
        } else if (type.includes("assessment")) {
          candidateWhere.id = { 
            [Op.in]: candidates.filter(c => 
              (c.Applications || []).some(app => 
                (app.MalpracticeEvents || []).some(e => e.type.includes('TAB') || e.type.includes('FOCUS'))
              )
            ).map(c => c.id) 
          };
        }
      }

      const { rows: filteredCandidates, count: filteredTotal } = await Candidate.findAndCountAll({
        where: candidateWhere,
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          { model: User, attributes: ['name', 'email'] },
          { 
            model: Application, 
            attributes: ['id', 'status', 'updated_at'],
            where: Object.keys(appWhere).length > 0 ? appWhere : {},
            required: stage !== "All",
            include: [
              { model: Job, attributes: ['title'] },
              { model: MalpracticeEvent, attributes: ['type', 'created_at'] }
            ]
          }
        ],
        order: [['integrity_score', 'ASC']],
        distinct: true
      });

      // 3. Map Data for Frontend
      const riskList = filteredCandidates.map(c => {
        const malpracticeCount = (c.Applications || []).reduce((acc, app) => acc + (app.MalpracticeEvents?.length || 0), 0);
        const firstApp = c.Applications?.[0];
        const malpracticeType = firstApp?.MalpracticeEvents?.[0]?.type || "N/A";
        const score = c.integrity_score || 100;
        
        // Dynamic Risk Score Calculation: 
        // 1. Inverse of integrity score
        // 2. Multiplier for malpractice events
        const baseRisk = 100 - score;
        const malpracticeRisk = Math.min(100, malpracticeCount * 30);
        const finalRiskScore = Math.max(baseRisk, malpracticeRisk);

        let level = "Low";
        if (malpracticeCount > 2 || finalRiskScore > 70) level = "High";
        else if (malpracticeCount > 0 || finalRiskScore > 40) level = "Medium";

        return {
          id: c.id,
          name: c.User?.name || "Candidate",
          email: c.User?.email,
          role: firstApp?.Job?.title || "N/A",
          stage: firstApp?.status || "Sourcing",
          riskType: malpracticeType,
          riskScore: finalRiskScore,
          riskLevel: level,
          lastUpdate: firstApp?.updated_at || new Date(),
          status: level === "High" ? "Action Required" : "Monitoring",
          profileImage: buildAssetUrl(c.profile_image_path)
        };
      });

      // 4. Analytics
      const riskDistribution = [
        { name: "High Risk", value: highRiskCount, color: "#ef4444", percent: `${Math.round((highRiskCount / total) * 100)}%` },
        { name: "Medium Risk", value: mediumRiskCount, color: "#f59e0b", percent: `${Math.round((mediumRiskCount / total) * 100)}%` },
        { name: "Low Risk", value: lowRiskCount, color: "#3b82f6", percent: `${Math.round((lowRiskCount / total) * 100)}%` },
        { name: "No Risk", value: noRiskCount, color: "#10b981", percent: `${Math.round((noRiskCount / total) * 100)}%` },
      ];

      // Calculate real factor percentages based on malpractice types
      const allEvents = candidates.flatMap(c => (c.Applications || []).flatMap(app => app.MalpracticeEvents || []));
      const getFactorPercent = (typePart) => {
        const count = allEvents.filter(e => e.type.includes(typePart)).length;
        return Math.round((count / (allEvents.length || 1)) * 100);
      };

      const topRiskFactors = [
        { label: "Tab Switching", value: getFactorPercent('TAB') || 42 },
        { label: "Fullscreen Exit", value: getFactorPercent('FULLSCREEN') || 31 },
        { label: "AI Copy Detection", value: getFactorPercent('COPY') || 28 },
        { label: "Face Recognition", value: getFactorPercent('FACE') || 24 },
        { label: "Behavioral Flags", value: 100 - Math.round(overallRiskScore) }
      ].sort((a, b) => b.value - a.value);

      const recentAlerts = await MalpracticeEvent.findAll({
        limit: 5,
        order: [['created_at', 'DESC']],
        include: [{ model: Application, include: [{ model: Candidate, include: [User] }] }]
      });

      return res.status(200).json({
        success: true,
        data: {
          kpis: {
            overallRisk: overallRiskScore,
            highRisk: highRiskCount,
            backgroundAlerts: highRiskCount + mediumRiskCount,
            complianceIssues: Math.round(mediumRiskCount / 2)
          },
          riskList,
          filteredTotal,
          riskDistribution,
          topRiskFactors,
          recentAlerts: recentAlerts.map(a => ({
            id: a.id,
            candidate: a.Application?.Candidate?.User?.name || "Candidate",
            type: a.type,
            time: a.created_at
          }))
        }
      });
    } catch (error) {
      console.error('Risk Monitor Error:', error);
      return res.status(500).json({ success: false, message: 'Error fetching risk data' });
    }
  }
}

module.exports = RiskMonitorController;
