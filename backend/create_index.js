const { sequelize } = require('./src/config/db');

async function createIndex() {
  try {
    await sequelize.query(`CREATE INDEX IF NOT EXISTS candidates_resume_fts ON "Candidates" USING GIN (to_tsvector('english', COALESCE(parsed_resume, '')));`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS candidates_summary_fts ON "Candidates" USING GIN (to_tsvector('english', COALESCE(summary, '')));`);
    console.log("Indexes created successfully");
  } catch (error) {
    console.error("Error creating indexes", error);
  } finally {
    process.exit(0);
  }
}

createIndex();
