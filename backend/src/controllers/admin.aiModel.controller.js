const { AIModel } = require("../models/index.js");
const auditLogger = require("../services/auditLogger.service");

const deployAIModel = async (req, res) => {
  try {
    const {
      modelVersion,
      modelType,
      description,
      accuracy,
    } = req.body;

    const model = await AIModel.create({
      modelVersion,
      modelType,
      status: "TESTING",
      accuracy,
      totalEvaluations: 0,
      correctEvaluations: 0,
      releaseDate: new Date(),
      createdBy: req.user.id,
      description,
    });

    await auditLogger.logModelDeployed(req, {
      modelId: model.modelId,
      modelVersion: modelVersion,
      modelType: modelType,
    });

    res.json({
      success: true,
      message: "AI model deployed successfully",
      data: model,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deploying AI model",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const activateAIModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = await AIModel.findByPk(modelId);

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "AI model not found",
      });
    }

    // Deactivate all other models of same type
    await AIModel.update(
      { status: "INACTIVE" },
      { where: { modelType: model.modelType, status: "ACTIVE" } }
    );

    // Activate this model
    await model.update({ status: "ACTIVE" });

    await auditLogger.log({
      actionType: "MODEL_DEPLOYED",
      userId: req.user.id,
      userRole: req.user.role,
      entityType: "AIModel",
      entityId: modelId,
      description: `AI Model activated: ${model.modelVersion}`,
      ipAddress: auditLogger.resolveIP(req),
      userAgent: req.get("User-Agent"),
      newValue: { status: "ACTIVE" },
      relatedAiModelVersion: model.modelVersion,
    });

    res.json({
      success: true,
      message: "AI model activated successfully",
      data: model,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error activating AI model",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const rollbackAIModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    const { rollbackToModelId } = req.body;

    const currentModel = await AIModel.findByPk(modelId);
    const previousModel = await AIModel.findByPk(rollbackToModelId);

    if (!currentModel || !previousModel) {
      return res.status(404).json({
        success: false,
        message: "AI model not found",
      });
    }

    // Deactivate current
    await currentModel.update({ status: "DEPRECATED" });

    // Activate previous
    await previousModel.update({ status: "ACTIVE" });

    await auditLogger.logModelRollback(req, {
      modelId: modelId,
      fromVersion: currentModel.modelVersion,
      toVersion: previousModel.modelVersion,
    });

    res.json({
      success: true,
      message: "AI model rolled back successfully",
      data: previousModel,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error rolling back AI model",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const getAIModels = async (req, res) => {
  try {
    const models = await AIModel.findAll({
      order: [["releaseDate", "DESC"]],
    });

    res.json({
      success: true,
      data: models,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching AI models",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const updateModelAccuracy = async (req, res) => {
  try {
    const { modelId } = req.params;
    const { accuracy, totalEvaluations, correctEvaluations } = req.body;

    const model = await AIModel.findByPk(modelId);

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "AI model not found",
      });
    }

    const failureRate = totalEvaluations > 0 
      ? ((totalEvaluations - correctEvaluations) / totalEvaluations) * 100 
      : 0;

    await model.update({
      accuracy,
      totalEvaluations,
      correctEvaluations,
      failureRate,
    });

    res.json({
      success: true,
      message: "Model accuracy updated",
      data: model,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating model accuracy",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

const updateFrozenCandidates = async (req, res) => {
  try {
    const { modelId } = req.params;
    const { candidates } = req.body; // array of application/candidate IDs

    const model = await AIModel.findByPk(modelId);
    if (!model) {
      return res.status(404).json({ success: false, message: "AI model not found" });
    }

    await model.update({ frozenCandidates: candidates });

    res.json({
      success: true,
      message: "Frozen candidates updated",
      data: model,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating frozen candidates",
      error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

module.exports = {
  deployAIModel,
  activateAIModel,
  rollbackAIModel,
  getAIModels,
  updateModelAccuracy,
  updateFrozenCandidates,
};
