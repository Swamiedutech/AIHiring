const axios = require("axios");
const FormData = require("form-data");
const { InterviewSession, Application } = require("../src/models");

const TOKEN = "dummy-token-for-testing";
const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 3: AI Video Interview Validation ---");

    // 1. Move application status to TECHNICAL_ROUND_COMPLETED so interview can be scheduled
    // (Actually the controller startInterviewPhase5 allows starting from INTERVIEW_UNLOCKED)
    const { Application } = require("../src/models");
    await Application.update({ status: 'INTERVIEW_UNLOCKED' }, { where: { id: APPLICATION_ID } });

    // 2. Start Interview
    const startResp = await axios.post(`${API_BASE}/interview/application/${APPLICATION_ID}/start`, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    if (!startResp.data.success) {
      console.error("Failed to start interview:", startResp.data);
      process.exit(1);
    }

    const { interview_session_id } = startResp.data;
    console.log(`Interview started. Session ID: ${interview_session_id}`);

    // 3. Submit Responses (3 questions)
    for (let i = 1; i <= 3; i++) {
        console.log(`  Submitting response for question ${i}/3...`);
        const form = new FormData();
        const payload = {
          question_id: `q_sim_${i}`,
          transcription: "This is a simulated transcription for the interview question. I have great experience in " + (i % 2 === 0 ? "Management" : "Marketing"),
          response_duration_seconds: 45,
          question_number: i
        };
        form.append("data", JSON.stringify(payload));
        // Simulate a small video blob
        form.append("video_blob", Buffer.from("simulated_video_data"), { filename: `q${i}.webm` });

        const resp = await axios.post(`${API_BASE}/interview/${interview_session_id}/response`, form, {
          headers: { 
            ...form.getHeaders(),
            Authorization: `Bearer ${TOKEN}` 
          }
        });
        
        if (!resp.data.success) {
           console.error(`Failed at question ${i}:`, resp.data);
           break;
        }
    }

    console.log("Interview Submission Complete.");

    // 4. Verify Final Analysis
    const session = await InterviewSession.findByPk(interview_session_id);
    console.log(`DB Verification: Status=${session.status}, Overall Score=${session.overall_score}`);
    console.log(`Recommendation: ${session.hire_recommendation}`);

    process.exit(0);
  } catch (err) {
    console.error("Phase 3 critical failure:", err.response?.data || err.message);
    process.exit(1);
  }
}

run();
