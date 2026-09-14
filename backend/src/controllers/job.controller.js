const { Job } = require("../models");

// ADMIN: Create Job
exports.createJob = async (req, res) => {
  try {
    const {
      title, department, location, employment_type,
      description, requirements, min_experience, max_experience,
      salary_min, salary_max, currency, status, valid_till
    } = req.body;
    const job = await Job.create({
      title, department, location, employment_type,
      description, requirements, min_experience, max_experience,
      salary_min, salary_max, currency, status, valid_till
    });
    res.status(201).json({ message: "Job created successfully", job });
  } catch (error) {
    res.status(400).json({ error: "Bad request", details: error.message });
  }
};

// ALL: Get Active Jobs
exports.getActiveJobs = async (req, res) => {
  try {
    const jobs = await Job.findAll({ where: { status: "ACTIVE" } });
    const formatted = jobs.map(j => {
      const job = j.toJSON();
      
      // Safe formatting for salary and experience
      const sMin = job.salary_min || 0;
      const sMax = job.salary_max || 0;
      const eMin = job.min_experience || 0;
      const eMax = job.max_experience || 0;

      return {
        ...job,
        _id: String(job.id),
        salary: `$${(sMin/1000).toFixed(0)}k - $${(sMax/1000).toFixed(0)}k`,
        experience: `${eMin}-${eMax} years`
      };
    });
    res.json(formatted);
  } catch (error) {
    console.error("Fetch jobs error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// ADMIN: Change Job Status
exports.updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const job = await Job.findByPk(id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    job.status = status;
    await job.save();

    res.json({ message: "Job status updated" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
