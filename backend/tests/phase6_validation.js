const axios = require("axios");

const TOKEN = "dummy-token-for-testing";
const API_BASE = "http://localhost:5000/api";

async function run() {
  try {
    console.log("--- PHASE 6: Admin Dashboard Validation ---");

    // 1. Check KPI Cards
    console.log("Fetching KPI Cards...");
    const kpiResp = await axios.get(`${API_BASE}/hr/dashboard/kpi`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    console.log("KPI Stats:", kpiResp.data.data);

    // 2. Check Application Funnel
    console.log("Fetching Hiring Funnel...");
    const funnelResp = await axios.get(`${API_BASE}/hr/dashboard/funnel`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    console.log("Funnel Stages:", funnelResp.data.data.length);

    // 3. Check Pending Actions
    console.log("Fetching Pending Actions...");
    const pendingResp = await axios.get(`${API_BASE}/hr/dashboard/pending-actions`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    console.log("Pending Actions Count:", pendingResp.data.data.length);

    process.exit(0);
  } catch (err) {
    console.error("Phase 6 critical failure:", err.response?.data || err.message);
    process.exit(1);
  }
}

run();
