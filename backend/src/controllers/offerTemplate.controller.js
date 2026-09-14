const { OfferTemplate } = require("../models");

exports.getTemplates = async (req, res) => {
  try {
    const templates = await OfferTemplate.findAll({ order: [["createdAt", "DESC"]] });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { templateName, templateContent } = req.body;
    const template = await OfferTemplate.create({
      templateName,
      templateContent,
      createdBy: req.user.id
    });
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { templateName, templateContent } = req.body;
    const template = await OfferTemplate.findByPk(id);
    if (!template) return res.status(404).json({ success: false, message: "Template not found" });

    template.templateName = templateName || template.templateName;
    template.templateContent = templateContent || template.templateContent;
    await template.save();

    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};
