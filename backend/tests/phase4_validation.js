const axios = require("axios");
process.env.NODE_ENV = 'development';
const { AIDecision, Application } = require("../src/models");

const TOKEN = "dummy-token-for-testing";
const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 4: AI Decision Core Validation ---");

    // 0. Clean up previous decisions
    await AIDecision.destroy({ where: { application_id: APPLICATION_ID } });

    // 1. Manually set scores if they are missing (for clean testing)
    await Application.update({
      resume_score: 75,
      technical_score: 33, // from phase 2
      interview_score: 50, // from phase 3
      status: 'HR_REVIEW'
    }, { where: { id: APPLICATION_ID } });

    // 2. Trigger Final Decision
    const resp = await axios.post(`${API_BASE}/ai/decision/make`, {
      applicationId: APPLICATION_ID
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!resp.data.success) {
      console.error("Decision core failed:", resp.data);
      process.exit(1);
    }

    console.log("Decision Result:", resp.data.data);

    // 3. Verify DB
    const decision = await AIDecision.findOne({ where: { application_id: APPLICATION_ID } });
    console.log(`DB Verification: Decision=${decision.ai_decision}, Final Score=${decision.final_score}`);

    process.exit(0);
  } catch (err) {
    console.error("Phase 4 critical failure:", err.response?.data || err.message);
    process.exit(1);
  }
}

run();
