const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TOKEN = "dummy-token-for-testing";
const APPLICATION_ID = 9999;
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 5: Automated Reporting Validation ---");

    // 1. Generate Report
    console.log(`Generating report for application ${APPLICATION_ID}...`);
    const resp = await axios.get(`${API_BASE}/hr/report/${APPLICATION_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: 'arraybuffer'
    });

    if (resp.status !== 200) {
      console.error("Report generation failed:", resp.data);
      process.exit(1);
    }

    const reportPath = path.join(__dirname, "candidate_9999_report.pdf");
    fs.writeFileSync(reportPath, resp.data);
    
    const stats = fs.statSync(reportPath);
    console.log(`Report generated successfully: ${reportPath} (${stats.size} bytes)`);

    process.exit(0);
  } catch (err) {
    console.error("Phase 5 critical failure:", err.response?.data?.toString() || err.message);
    process.exit(1);
  }
}

run();
