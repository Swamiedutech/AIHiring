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

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: Production (Supabase)`);

      // Start Background Workers
      const notificationWorker = require("./workers/notification.worker");
      notificationWorker.start();
      const assessmentWorker = require("./workers/assessment.worker");
      assessmentWorker.start();
      const interviewWorker = require("./workers/interview.worker");
      interviewWorker.start();
      const healthWorker = require("./workers/health.worker");
      healthWorker.start();
    });

    // Graceful Shutdown
    const gracefulShutdown = () => {
      console.log('Received kill signal, shutting down gracefully');
      server.close(() => {
        console.log('Closed out remaining connections');
        sequelize.close().then(() => {
          console.log('Database connection closed.');
          process.exit(0);
        });
      });

      // Force close server after 10 secs
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    process.on('uncaughtException', (err) => {
      console.error('UNCAUGHT EXCEPTION:', err);
      gracefulShutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('UNHANDLED REJECTION:', reason);
      gracefulShutdown();
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
