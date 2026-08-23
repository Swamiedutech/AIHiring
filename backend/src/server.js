require('dotenv').config();

console.log("🚀 Initializing AI Hiring System Backend...");

const app = require("./app");
const { sequelize } = require("./config/db");

// Load models to ensure associations are registered
require("./models");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 🔍 Connection Test
    console.log("📡 Connecting to Supabase PostgreSQL...");
    await sequelize.authenticate();
    console.log("✅ Database authenticated successfully");

    // NOTE: Schema sync is disabled as per production requirements. 
    // All tables must be created directly in Supabase.

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: Production (Supabase)`);

      // Start Background Workers
      const notificationWorker = require("./workers/notification.worker");
      notificationWorker.start();
    });

  } catch (error) {
    console.error("\n❌ DATABASE CONNECTION FAILED:");
    console.error("--------------------------------");
    console.error(error);
    console.error("--------------------------------\n");
    process.exit(1);
  }
}

startServer();
// Trigger restart
