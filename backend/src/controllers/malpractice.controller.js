const { MalpracticeEvent, Application } = require("../models");

exports.logEvent = async (req, res) => {
  try {
    const { application_id, type, meta } = req.body;

    const application = await Application.findByPk(application_id);
    if (!application || (req.user?.role === 'CANDIDATE' && req.candidate && application.candidate_id !== req.candidate.id)) {
      return res.status(404).json({ message: "Application not found or unauthorized" });
    }

    // Severity logic (backend decides)
    const severityMap = {
      TAB_SWITCH: 1,
      WINDOW_BLUR: 1,
      FULLSCREEN_EXIT: 3,
      MIC_MUTED: 2,
      SILENCE: 2,
      CAMERA_OFF: 3,
      MULTIPLE_FACES: 5,
      NETWORK_DROP: 1
    };

    const event = await MalpracticeEvent.create({
      application_id,
      type,
      severity: severityMap[type] || 1,
      meta
    });

    res.json({ message: "Event logged", event });

  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getMalpracticeSummary = async (req, res) => {
  try {
    const { application_id } = req.params;

    const events = await MalpracticeEvent.findAll({
      where: { application_id },
      order: [["created_at", "ASC"]]
    });

    const totalViolations = events.length;
    const totalSeverity = events.reduce((s, e) => s + e.severity, 0);

    res.json({
      totalViolations,
      totalSeverity,
      events
    });

  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};