const axios = require("axios");

const TOKEN = "dummy-token-for-testing";
// Using the same HR token (HR role is enough for these MD routes too)
// Actually MD usually has its own role, but HR is in the allowedRoles for these routes.

const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 7: MD Executive Terminal Validation ---");

    // 1. Get AI Analysis (Complete)
    console.log(`Fetching complete AI analysis for application ${APPLICATION_ID}...`);
    const analysisResp = await axios.get(`${API_BASE}/ai/analysis/${APPLICATION_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    
    if (!analysisResp.data.success) {
      console.error("Analysis retrieval failed:", analysisResp.data);
      process.exit(1);
    }
    console.log("Analysis Data Received:", Object.keys(analysisResp.data.data));

    // 2. Check Benchmarking (Benchmark against other candidates)
    console.log("Fetching benchmarking data...");
    const benchResp = await axios.get(`${API_BASE}/hr/applications/${APPLICATION_ID}/benchmark`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    console.log("Benchmarking Percentile:", benchResp.data.data?.percentile);

    // 3. Generate Executive Report
    console.log("Generating Executive Report...");
    const reportResp = await axios.get(`${API_BASE}/hr/reports/executive/${APPLICATION_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: 'arraybuffer'
    });
    console.log("Executive Report Size:", reportResp.data.byteLength);

    process.exit(0);
  } catch (err) {
    let errorData = err.response?.data;
    if (Buffer.isBuffer(errorData)) {
      errorData = errorData.toString();
    }
    console.error("Phase 7 critical failure:", errorData || err.message);
    process.exit(1);
  }
}

run();
