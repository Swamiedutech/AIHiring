const { sequelize } = require('./src/config/db');
const fixTableNames = require('./migrations/20260212-add-rubber-process-engineer-role');
const missingConstraints = require('./migrations/20260831111700-add-missing-constraints-and-indexes');
const models = require('./src/models/index');

async function runMigrations() {
  try {
    console.log("Connecting to Supabase...");
    await sequelize.authenticate();
    console.log("Connection established successfully.");

    console.log("Creating missing tables...");
    await models.Document.sync({ alter: true });
    await models.HRAuditLog.sync({ alter: true });
    await models.HRInternalNote.sync({ alter: true });
    await models.EvaluationProsCons.sync({ alter: true });
    await models.Session.sync({ alter: true });
    console.log("Missing tables created/verified.");

    const queryInterface = sequelize.getQueryInterface();
    const Sequelize = sequelize.Sequelize;

    console.log("Applying fixTableNames migration...");
    try {
      await fixTableNames.up(queryInterface, Sequelize);
      console.log("fixTableNames applied.");
    } catch (e) {
      console.log("fixTableNames skipped or failed (might already be applied):", e.message);
    }

    console.log("Applying missingConstraints migration...");
    try {
      await missingConstraints.up(queryInterface, Sequelize);
      console.log("missingConstraints applied.");
    } catch (e) {
      console.log("missingConstraints failed:", e.message);
    }

    console.log("All migrations finished.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
