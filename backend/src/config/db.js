require("dotenv").config();
const { Sequelize } = require("sequelize");

if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL ERROR: DATABASE_URL not found in .env");
  process.exit(1);
}

// Strictly Supabase PostgreSQL configuration with resilience settings
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: process.env.NODE_ENV === 'production' // Ensure server identity is verified in prod
    },
    keepAlive: true // Help prevent ECONNRESET by keeping connection active
  },
  logging: false,
  pool: {
    max: 15, // Slightly lower to prevent hitting Supabase limits
    min: 2,
    acquire: 60000,
    idle: 30000, // Longer idle time before closing
    evict: 1000 // Frequency of checking for idle connections to evict
  },
  retry: {
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
      /ECONNRESET/ // Specifically catch and retry on resets
    ],
    max: 3 // Retry up to 3 times for transient failures
  }
});

module.exports = { sequelize, Sequelize };
