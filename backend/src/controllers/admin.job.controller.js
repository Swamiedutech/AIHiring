const { Job, Application, TechnicalQuestionBank, InterviewQuestionBank } = require("../models/index.js");
const auditLogger = require("../services/auditLogger.service");
const logger = require("../utils/logger");

// Normalize a Job row to the shape the frontend expects
function normalize(job) {
  const j = job.toJSON ? job.toJSON() : job;
  // Sequelize association names can vary by version, handle both
  const tqArr = j.TechnicalQuestionBanks || j.technical_question_banks || j.TechnicalQuestions || [];
  const iqArr = j.InterviewQuestionBanks || j.interview_question_banks || j.InterviewQuestions || [];
  
  return {
    _id: String(j.id),
    id: j.id,
    title: j.title,
    department: j.department,
    location: j.location || "Remote",
    type: j.type || "FULL_TIME",
    status: j.status === "INACTIVE" ? "CLOSED" : j.status,
    description: j.description || j.jobDescription || "",
    requirements: j.requirements || "",
    salaryMin: j.salary_min || 0,
    salaryMax: j.salary_max || 0,
    minExperience: j.min_experience || 0,
    maxExperience: j.max_experience || 0,
    urgency: j.urgency || "NORMAL",
    requiredSkills: j.required_skills || [],
    skillWeights: j.skill_weights || {},
    createdAt: j.created_at || j.createdAt,
    applicationCount: j.applicationCount || 0,
    technicalQuestions: tqArr,
    interviewQuestions: iqArr,
    technicalQuestionsCount: tqArr.length,
    interviewQuestionsCount: iqArr.length
  };
}

const getJobs = async (req, res) => {
  try {
    const jobs = await Job.findAll({ 
      order: [["created_at", "DESC"]],
      include: [
        { model: TechnicalQuestionBank },
        { model: InterviewQuestionBank }
      ]
    });
    const appCounts = await Application.findAll({
      attributes: ['job_id', [Application.sequelize.fn('COUNT', Application.sequelize.col('id')), 'count']],
      group: ['job_id'],
      raw: true
    });
    
    const countMap = {};
    appCounts.forEach(c => countMap[c.job_id] = parseInt(c.count, 10));

    const withCounts = jobs.map(job => {
      const n = normalize(job);
      n.applicationCount = countMap[job.id] || 0;
      return n;
    });
    
    res.json({ success: true, data: withCounts });
  } catch (error) {
    logger.error("getJobs error:", error);
    res.status(500).json({ success: false, message: "Error fetching jobs" });
  }
};

const getJobById = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId, {
      include: [
        { model: TechnicalQuestionBank },
        { model: InterviewQuestionBank }
      ]
    });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    res.json({ success: true, data: normalize(job) });
  } catch (error) {
    logger.error("getJobById error:", error);
    res.status(500).json({ success: false, message: "Error fetching job" });
  }
};

const createJob = async (req, res) => {
  try {
    const { 
      title, department, location, type, description, requirements, 
      salaryMin, salaryMax, minExperience, maxExperience, urgency, 
      requiredSkills, skillWeights,
      technicalQuestions, interviewQuestions 
    } = req.body;

    logger.info(`Creating job: ${title} with ${technicalQuestions?.length || 0} tech questions`);

    const job = await Job.create({
      title,
      department,
      location: location || "Remote",
      type: type || "FULL_TIME",
      description: description || "",
      requirements: requirements || "",
      salary_min: salaryMin || 0,
      salary_max: salaryMax || 0,
      min_experience: minExperience || 0,
      max_experience: maxExperience || 10,
      urgency: urgency || "NORMAL",
      required_skills: requiredSkills || [],
      skill_weights: skillWeights || {},
      status: "ACTIVE",
    });

    // Create Technical Questions if provided
    if (technicalQuestions && Array.isArray(technicalQuestions)) {
      const tqToCreate = technicalQuestions.map(q => ({
        ...q,
        job_id: job.id,
        jobRole: title,
        topic: q.topic || "General",
        questionType: q.questionType || "THEORY",
        createdBy: (req.user && (req.user.email || req.user.id)) || 'admin'
      }));
      await TechnicalQuestionBank.bulkCreate(tqToCreate);
    }

    // Create Interview Questions if provided
    if (interviewQuestions && Array.isArray(interviewQuestions)) {
      const iqToCreate = interviewQuestions.map(q => ({
        ...q,
        job_id: job.id,
        jobRole: title,
        category: q.category || "TECHNICAL_DEEP_DIVE",
        expectedAnswer: q.expectedAnswer || "To be discussed",
        createdBy: (req.user && (req.user.email || req.user.id)) || 'admin'
      }));
      await InterviewQuestionBank.bulkCreate(iqToCreate);
    }

    await auditLogger.logJobChange(req, {
      actionType: "JOB_CREATED",
      jobId: job.id,
      newValue: normalize(job),
      description: `Job created: "${job.title}" with associated questions.`,
    });

    res.json({ success: true, message: "Job created successfully", data: normalize(job) });
  } catch (error) {
    logger.error("createJob error:", error);
    res.status(500).json({ success: false, message: "Error creating job: " + error.message });
  }
};

const updateJob = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const oldSnapshot = normalize(job);
    const { 
      title, department, location, type, description, requirements, 
      salaryMin, salaryMax, minExperience, maxExperience, urgency, 
      requiredSkills, skillWeights,
      technicalQuestions, interviewQuestions
    } = req.body;

    logger.info(`Updating job ${job.id}: ${title}`);

    await job.update({
      ...(title && { title }),
      ...(department && { department }),
      ...(location && { location }),
      ...(type && { type }),
      ...(description !== undefined && { description }),
      ...(requirements !== undefined && { requirements }),
      ...(salaryMin !== undefined && { salary_min: salaryMin }),
      ...(salaryMax !== undefined && { salary_max: salaryMax }),
      ...(minExperience !== undefined && { min_experience: minExperience }),
      ...(maxExperience !== undefined && { max_experience: maxExperience }),
      ...(urgency && { urgency }),
      ...(requiredSkills && { required_skills: requiredSkills }),
      ...(skillWeights && { skill_weights: skillWeights }),
    });

    // Update Questions (Delete existing and bulk create)
    if (technicalQuestions && Array.isArray(technicalQuestions)) {
      await TechnicalQuestionBank.destroy({ where: { job_id: job.id } });
      const tqToCreate = technicalQuestions.map(q => ({
        ...q,
        job_id: job.id,
        jobRole: title || job.title,
        topic: q.topic || "General",
        questionType: q.questionType || "THEORY",
        createdBy: (req.user && (req.user.email || req.user.id)) || 'admin'
      }));
      await TechnicalQuestionBank.bulkCreate(tqToCreate);
    }

    if (interviewQuestions && Array.isArray(interviewQuestions)) {
      await InterviewQuestionBank.destroy({ where: { job_id: job.id } });
      const iqToCreate = interviewQuestions.map(q => ({
        ...q,
        job_id: job.id,
        jobRole: title || job.title,
        category: q.category || "TECHNICAL_DEEP_DIVE",
        expectedAnswer: q.expectedAnswer || "To be discussed",
        createdBy: (req.user && (req.user.email || req.user.id)) || 'admin'
      }));
      await InterviewQuestionBank.bulkCreate(iqToCreate);
    }

    res.json({ success: true, message: "Job updated successfully", data: normalize(job) });
  } catch (error) {
    logger.error("updateJob error:", error);
    res.status(500).json({ success: false, message: "Error updating job: " + error.message });
  }
};

const activateJob = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    await job.update({ status: "ACTIVE" });
    res.json({ success: true, message: "Job activated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error activating job" });
  }
};

const closeJob = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    await job.update({ status: "INACTIVE" });
    res.json({ success: true, message: "Job closed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error closing job" });
  }
};

const deleteJob = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    await job.destroy();
    res.json({ success: true, message: "Job deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting job" });
  }
};

module.exports = { createJob, updateJob, getJobs, getJobById, activateJob, closeJob, deleteJob };
