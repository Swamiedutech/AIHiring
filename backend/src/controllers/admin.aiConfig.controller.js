const { AIConfig } = require("../models/index.js");
const auditLogger = require("../services/auditLogger.service");

const createAIConfig = async (req, res) => {
  try {
    const {
      jobId,
      resumeWeight,
      mcqWeight,
      technicalWeight,
      interviewWeight,
      passingThreshold,
      integrityPenalty,
      confidenceWeighting,
      prosConsRules,
      riskyWordings,
      autoEscalateThreshold,
    } = req.body;

    // Validate weights sum to 1.0
    const totalWeight =
      (resumeWeight || 0.25) +
      (mcqWeight || 0.25) +
      (technicalWeight || 0.25) +
      (interviewWeight || 0.25);

    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return res.status(400).json({
        success: false,
        message: "Stage weights must sum to 1.0",
      });
    }

    const config = await AIConfig.create({
      jobId,
      resumeWeight: resumeWeight || 0.25,
      mcqWeight: mcqWeight || 0.25,
      technicalWeight: technicalWeight || 0.25,
      interviewWeight: interviewWeight || 0.25,
      passingThreshold,
      integrityPenalty,
      confidenceWeighting,
      prosConsRules,
      riskyWordings,
      autoEscalateThreshold,
      createdBy: req.user.id,
      status: "ACTIVE",
    });

    await auditLogger.logConfigChange(req, {
      entityType: "AIConfig",
      entityId: config.configId,
      newValue: config,
      description: `AI config created for job: ${jobId}`,
    });

    res.json({
      success: true,
      message: "AI configuration created successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating AI configuration",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const updateAIConfig = async (req, res) => {
  try {
    const { configId } = req.params;
    const config = await AIConfig.findByPk(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "AI configuration not found",
      });
    }

    // Validate weights if provided
    const {
      resumeWeight,
      mcqWeight,
      technicalWeight,
      interviewWeight,
    } = req.body;

    if (
      resumeWeight ||
      mcqWeight ||
      technicalWeight ||
      interviewWeight
    ) {
      const totalWeight =
        (resumeWeight || config.resumeWeight) +
        (mcqWeight || config.mcqWeight) +
        (technicalWeight || config.technicalWeight) +
        (interviewWeight || config.interviewWeight);

      if (Math.abs(totalWeight - 1.0) > 0.01) {
        return res.status(400).json({
          success: false,
          message: "Stage weights must sum to 1.0",
        });
      }
    }

    const allowedConfigFields = {
      resumeWeight: req.body.resumeWeight,
      mcqWeight: req.body.mcqWeight,
      technicalWeight: req.body.technicalWeight,
      interviewWeight: req.body.interviewWeight,
      passingThreshold: req.body.passingThreshold,
      integrityPenalty: req.body.integrityPenalty,
      confidenceWeighting: req.body.confidenceWeighting,
      prosConsRules: req.body.prosConsRules,
      riskyWordings: req.body.riskyWordings,
      autoEscalateThreshold: req.body.autoEscalateThreshold,
      status: req.body.status
    };

    const oldValue = { ...config.dataValues };
    await config.update(allowedConfigFields);

    await auditLogger.logConfigChange(req, {
      entityType: "AIConfig",
      entityId: configId,
      oldValue,
      newValue: config.dataValues,
      description: `AI config updated for job: ${config.jobId}`,
    });

    res.json({
      success: true,
      message: "AI configuration updated successfully",
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating AI configuration",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getAIConfig = async (req, res) => {
  try {
    const { jobId } = req.params;
    const config = await AIConfig.findOne({
      where: { jobId: String(jobId) },
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "AI configuration not found for this job",
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching AI configuration",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getAllAIConfigs = async (req, res) => {
  try {
    const configs = await AIConfig.findAll({
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching AI configurations",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const testAIConfig = async (req, res) => {
  try {
    const { configId } = req.params;
    const config = await AIConfig.findByPk(configId);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "AI configuration not found",
      });
    }

    const { Job } = require("../models/index.js");
    const job = await Job.findOne({ where: { id: config.jobId } });
    
    // Comprehensive Validation
    const errors = [];
    const warnings = [];

    // 1. Job existence
    if (!job) errors.push(`Linked Job (ID: ${config.jobId}) does not exist in the database.`);

    // 2. Weight validation
    const totalWeight = config.resumeWeight + config.mcqWeight + config.technicalWeight + config.interviewWeight;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      errors.push(`Critical: Stage weights sum to ${totalWeight.toFixed(2)}, but must be exactly 1.0.`);
    }

    // 3. Threshold sanity checks
    if (config.passingThreshold < 0.1 || config.passingThreshold > 0.9) {
      warnings.push("Passing threshold is unusually high or low (recommended: 0.5 - 0.7)");
    }
    if (config.autoEscalateThreshold <= config.passingThreshold) {
      errors.push("Auto-escalate threshold must be higher than passing threshold.");
    }

    // 4. Governance checks
    if (!config.confidenceWeighting || config.confidenceWeighting.HIGH < config.confidenceWeighting.LOW) {
      errors.push("Confidence weighting factors are misconfigured (HIGH should be > LOW).");
    }

    const isSuccess = errors.length === 0;

    const testResult = {
      configId,
      status: isSuccess ? "VERIFIED" : "FAILED",
      timestamp: new Date(),
      validation: {
        errors,
        warnings,
        totalWeight: totalWeight.toFixed(2),
        linkedJob: job?.title || "Unknown"
      },
      result: isSuccess 
        ? "Configuration is valid and ready for production deployment." 
        : `Configuration has ${errors.length} critical errors. See validation details.`,
    };

    if (isSuccess) {
       await config.update({ status: "ACTIVE" });
    } else {
       await config.update({ status: "INACTIVE" });
    }

    res.json({
      success: true,
      message: isSuccess ? "AI configuration test passed" : "AI configuration test failed",
      data: testResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error testing AI configuration",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

module.exports = {
  createAIConfig,
  updateAIConfig,
  getAIConfig,
  getAllAIConfigs,
  testAIConfig,
};
