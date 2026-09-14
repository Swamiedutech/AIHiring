const { Candidate, User, Application, Job } = require('../models');
const { Op } = require('sequelize');
const { STATUS_GROUPS } = require('../utils/applicationStatus.utils');
const { buildAssetUrl } = require('../utils/urlHelper');

class TalentPoolController {
  /**
   * GET /hr/talent-pool
   */
  static async getTalentPool(req, res) {
    try {
      let { search = "", tab = "All", page = 1, limit = 10 } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      if (limit > 100) limit = 100;
      const offset = (page - 1) * limit;

      // 1. Base counts
      const [totalCount, engagedCount, hiredCount, rejectedCount] = await Promise.all([
        Candidate.count(),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.active } } }),
        Application.count({ where: { status: 'HIRED' } }),
        Application.count({ where: { status: { [Op.in]: STATUS_GROUPS.rejected } } }),
      ]);

      const nurturingCount = Math.max(0, totalCount - engagedCount - hiredCount - rejectedCount);

      // 2. Build list filter
      let candidateWhere = {};
      let appWhere = {};

      if (search) {
        const searchEscaped = search.replace(/'/g, "''");
        candidateWhere[Op.or] = [
          { location: { [Op.iLike]: `%${search}%` } },
          { '$User.name$': { [Op.iLike]: `%${search}%` } },
          Candidate.sequelize.literal(`to_tsvector('english', COALESCE("Candidate"."parsed_resume"::text, '')) @@ plainto_tsquery('english', '${searchEscaped}')`),
          Candidate.sequelize.literal(`to_tsvector('english', COALESCE("Candidate"."summary"::text, '')) @@ plainto_tsquery('english', '${searchEscaped}')`)
        ];
      }

      if (tab === "Engaged") {
        appWhere.status = { [Op.in]: STATUS_GROUPS.active };
      } else if (tab === "Hired") {
        appWhere.status = 'HIRED';
      } else if (tab === "Rejected") {
        appWhere.status = { [Op.in]: STATUS_GROUPS.rejected };
      }

      const { rows: candidates, count: filteredCount } = await Candidate.findAndCountAll({
        where: candidateWhere,
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          { 
            model: User, 
            attributes: ['name', 'email']
            // removed the broken AND condition here
          },
          { 
            model: Application, 
            attributes: ['status', 'overall_score'],
            where: Object.keys(appWhere).length > 0 ? appWhere : {},
            required: tab !== "All" && tab !== "Nurturing",
            include: [{ model: Job, attributes: ['title'] }]
          }
        ],
        order: [['created_at', 'DESC']],
        distinct: true
      });

      // 3. ADAPTIVE MARKET SKILLS AXIS (Context-Aware)
      // First, get the skills that are ACTUALLY required by the company's job roles
      const jobs = await Job.findAll({ attributes: ['required_skills'] });
      let industrialSkillInventory = [];
      jobs.forEach(j => {
        if (Array.isArray(j.required_skills)) {
          industrialSkillInventory.push(...j.required_skills.map(s => s.toUpperCase()));
        }
      });
      
      // Get the most demanded skills across all jobs
      const demandMap = {};
      industrialSkillInventory.forEach(s => demandMap[s] = (demandMap[s] || 0) + 1);
      const topDemandedSkills = Object.keys(demandMap)
        .sort((a, b) => demandMap[b] - demandMap[a])
        .slice(0, 15); // Top 15 demanded skills

      // Fallback if no jobs or skills
      if (topDemandedSkills.length < 5) {
        topDemandedSkills.push(...["MARKETING", "SEO", "RUBBER PROCESSING", "QUALITY CONTROL", "DATA ANALYSIS", "COMMUNICATION"]);
      }

      // Now scan the talent pool for these specific industrial skills
      const allCandidatesForSkills = await Candidate.findAll({ 
        attributes: ['skills', 'summary', 'parsed_resume'] 
      });
      
      const skillAvailability = {};
      topDemandedSkills.forEach(sk => skillAvailability[sk] = 0);

      allCandidatesForSkills.forEach(c => {
        const skillArray = Array.isArray(c.skills) ? c.skills : [];
        const contentBlock = `${skillArray.join(' ')} ${c.summary || ''} ${c.parsed_resume || ''}`.toUpperCase();
        
        topDemandedSkills.forEach(sk => {
          if (contentBlock.includes(sk)) {
            skillAvailability[sk]++;
          }
        });
      });

      const topSkills = Object.keys(skillAvailability)
        .map(name => ({
          name,
          count: skillAvailability[name],
          progress: Math.min(100, Math.round((skillAvailability[name] / (totalCount || 1)) * 100))
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 4. Distribution
      const distribution = [
        { name: "Engaged", value: engagedCount, color: "#10b981", percent: `${Math.round((engagedCount / (totalCount || 1)) * 100)}%` },
        { name: "Nurturing", value: nurturingCount, color: "#8b5cf6", percent: `${Math.round((nurturingCount / (totalCount || 1)) * 100)}%` },
        { name: "Not Engaged", value: rejectedCount, color: "#ef4444", percent: `${Math.round((rejectedCount / (totalCount || 1)) * 100)}%` },
        { name: "Hired", value: hiredCount, color: "#3b82f6", percent: `${Math.round((hiredCount / (totalCount || 1)) * 100)}%` },
      ];

      return res.status(200).json({
        success: true,
        data: {
          kpis: { totalTalent: totalCount, engaged: engagedCount, nurturing: nurturingCount, rejected: rejectedCount, hired: hiredCount },
          distribution,
          topSkills,
          filteredCount,
          talentList: candidates.map(c => ({
            id: c.id,
            name: c.User?.name || "Candidate",
            loc: c.location || "N/A",
            role: c.Applications?.[0]?.Job?.title || "N/A",
            skills: c.skills || [],
            status: c.Applications?.[0]?.status || "UNPROCESSED",
            score: Math.round(c.Applications?.[0]?.overall_score || c.ai_score || 0),
            img: buildAssetUrl(c.profile_image_path, "/images/default-avatar.png"),
            added: new Date(c.created_at).toLocaleDateString()
          }))
        }
      });
    } catch (error) {
      console.error('Talent pool error:', error);
      return res.status(500).json({ success: false, message: 'Error fetching talent pool data' });
    }
  }
}

module.exports = TalentPoolController;
