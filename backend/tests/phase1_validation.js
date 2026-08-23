const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { ResumeAnalysis, Application } = require("../src/models");

const TOKEN = "dummy-token-for-testing";
const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

const results = {
  phase: "Phase 1: Intelligent Onboarding",
  tests: []
};

async function logTest(name, status, details) {
  results.tests.push({ name, status, details });
  console.log(`[${status}] ${name}: ${details}`);
}

async function run() {
  try {
    // 1. Valid PDF Upload
    try {
      const validFilePath = path.join(__dirname, "../uploads/resumes/1771614578955-Navale_Resume.pdf");
      const form = new FormData();
      form.append("resume", fs.createReadStream(validFilePath));
      form.append("applicationId", APPLICATION_ID);

      const resp = await axios.post(`${API_BASE}/resume/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${TOKEN}`
        }
      });

      if (resp.data.success) {
        // Check DB
        const analysis = await ResumeAnalysis.findOne({ where: { application_id: APPLICATION_ID } });
        if (analysis && analysis.overall_score > 0) {
          await logTest("Valid PDF Upload", "PASS", `Score: ${analysis.overall_score}, Summary: ${analysis.ai_summary}`);
        } else {
          await logTest("Valid PDF Upload", "FAIL", "DB Record missing or score is 0");
        }
      } else {
        await logTest("Valid PDF Upload", "FAIL", resp.data.message);
      }
    } catch (err) {
      await logTest("Valid PDF Upload", "ERROR", err.message);
    }

    // 2. Corrupted File Upload
    try {
      const corruptedPath = path.join(__dirname, "corrupted.pdf");
      fs.writeFileSync(corruptedPath, "THIS IS NOT A PDF");
      const form = new FormData();
      form.append("resume", fs.createReadStream(corruptedPath));
      form.append("applicationId", APPLICATION_ID);

      const resp = await axios.post(`${API_BASE}/resume/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${TOKEN}`
        }
      });
      // Depending on implementation, it might fail parsing but return 200 with fallback, or return 400/500
      await logTest("Corrupted File Upload", "INFO", `Code: ${resp.status}, Message: ${resp.data.message || 'No message'}`);
      fs.unlinkSync(corruptedPath);
    } catch (err) {
      await logTest("Corrupted File Upload", "INFO", `Caught expected error or status: ${err.response?.status} - ${err.message}`);
    }

    // 3. Empty File Upload
    try {
      const emptyPath = path.join(__dirname, "empty.pdf");
      fs.writeFileSync(emptyPath, "");
      const form = new FormData();
      form.append("resume", fs.createReadStream(emptyPath));
      form.append("applicationId", APPLICATION_ID);

      const resp = await axios.post(`${API_BASE}/resume/upload`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${TOKEN}`
        }
      });
      await logTest("Empty File Upload", "INFO", `Code: ${resp.status}, Message: ${resp.data.message || 'No message'}`);
      fs.unlinkSync(emptyPath);
    } catch (err) {
      await logTest("Empty File Upload", "INFO", `Caught expected error or status: ${err.response?.status} - ${err.message}`);
    }

    // Final result to file
    fs.writeFileSync(path.join(__dirname, "phase1_results.json"), JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Phase 1 critical failure:", err);
    process.exit(1);
  }
}

run();
