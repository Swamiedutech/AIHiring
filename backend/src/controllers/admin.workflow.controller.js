const { AdminWorkflow } = require("../models/index.js");
const auditLogger = require("../services/auditLogger.service");

function _serialize(wf) {
  return {
    _id: String(wf.workflowId),
    name: wf.workflowName,
    description: wf.description || "",
    stages: Array.isArray(wf.stages) ? wf.stages : (wf.stageOrder || []),
    approvalRequired: !!wf.approvalRequired,
    isActive: wf.isActive !== false,
    jobId: wf.jobId ? String(wf.jobId) : null,
    createdAt: wf.createdAt,
  };
}

const createWorkflow = async (req, res) => {
  try {
    const { name, workflowName, description, jobId, stages, approvalRequired } = req.body;
    const finalName = workflowName || name;

    const workflow = await AdminWorkflow.create({
      workflowName: finalName,
      description,
      jobId: jobId || null,
      stages: stages || [],
      stageOrder: stages || [],
      approvalRequired: approvalRequired !== false,
      isActive: true,
      createdBy: req.user.id,
    });

    await auditLogger.logRuleChange(req, {
      entityType: "Workflow",
      entityId: workflow.workflowId,
      newValue: { workflowName: workflow.workflowName, stages: workflow.stages },
      description: `Workflow created: "${name}"`,
    });

    res.json({ success: true, data: _serialize(workflow) });
  } catch (error) {
    console.error("createWorkflow error:", error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

const updateWorkflow = async (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = await AdminWorkflow.findByPk(workflowId);

    if (!workflow) return res.status(404).json({ success: false, message: "Workflow not found" });

    const oldSnapshot = {
      workflowName: workflow.workflowName,
      stages: workflow.stages,
      approvalRequired: workflow.approvalRequired,
    };

    const { name, workflowName, description, jobId, stages, approvalRequired } = req.body;
    const finalName = workflowName || name;
    
    await workflow.update({
      workflowName: finalName || workflow.workflowName,
      description: description !== undefined ? description : workflow.description,
      jobId: jobId !== undefined ? (jobId || null) : workflow.jobId,
      stages: stages || workflow.stages,
      stageOrder: stages || workflow.stageOrder,
      approvalRequired: approvalRequired !== undefined ? approvalRequired : workflow.approvalRequired,
    });

    await auditLogger.logRuleChange(req, {
      entityType: "Workflow",
      entityId: workflowId,
      oldValue: oldSnapshot,
      newValue: { workflowName: workflow.workflowName, stages: workflow.stages, approvalRequired: workflow.approvalRequired },
      description: `Workflow updated: "${workflow.workflowName}"`,
    });

    res.json({ success: true, data: _serialize(workflow) });
  } catch (error) {
    console.error("updateWorkflow error:", error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

const getWorkflows = async (req, res) => {
  try {
    const workflows = await AdminWorkflow.findAll({ order: [["createdAt", "DESC"]] });
    res.json({ success: true, data: workflows.map(_serialize) });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

const getWorkflowByJobId = async (req, res) => {
  try {
    const workflow = await AdminWorkflow.findOne({ where: { jobId: req.params.jobId } });
    res.json({ success: true, data: workflow ? _serialize(workflow) : null });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

module.exports = { createWorkflow, updateWorkflow, getWorkflows, getWorkflowByJobId };
