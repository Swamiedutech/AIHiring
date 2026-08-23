const axios = require("axios");
const { AssessmentAttempt, Application } = require("../src/models");

const TOKEN = "dummy-token-for-testing";
const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 2: Technical Assessment Validation ---");

    // 1. Start Assessment - GET
    const startResp = await axios.get(`${API_BASE}/assessment/application/${APPLICATION_ID}/start`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    if (!startResp.data.success) {
      console.error("Failed to start assessment:", startResp.data);
      process.exit(1);
    }

    const { attempt_id, questions } = startResp.data;
    console.log(`Assessment started. Attempt ID: ${attempt_id}, Questions: ${questions.length}`);

    // 2. Save Answers - POST /:id/answer
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        let answer = "This is a simulated answer for " + q.question;
        
        // Make some answers empty or wrong
        if (i % 5 === 0) answer = ""; // Empty
        if (i % 5 === 1) answer = "Wrong answer that has nothing to do with the topic."; // Wrong

        await axios.post(`${API_BASE}/assessment/${attempt_id}/answer`, {
          question_id: q.id,
          answer_text: answer
        }, {
          headers: { Authorization: `Bearer ${TOKEN}` }
        });
        
        if (i % 5 === 0) console.log(`  Saved answer for question ${i + 1}/${questions.length}`);
    }

    // 3. Proctoring Validation
    console.log("Simulating proctoring events...");
    await axios.post(`${API_BASE}/assessment/${attempt_id}/malpractice`, {
      type: "TAB_SWITCH",
      metadata: { url: "https://google.com" }
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    // 4. Submit Assessment - POST /:id/submit
    console.log("Submitting assessment...");
    const submitResp = await axios.post(`${API_BASE}/assessment/${attempt_id}/submit`, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    console.log("Submission Result:", submitResp.data);

    // 5. Verify DB persistence
    const attempt = await AssessmentAttempt.findByPk(attempt_id);
    console.log(`DB Verification: Status=${attempt.status}, Final Score=${attempt.final_score}`);

    process.exit(0);
  } catch (err) {
    console.error("Phase 2 critical failure:", err.response?.data || err.message);
    process.exit(1);
  }
}

run();
