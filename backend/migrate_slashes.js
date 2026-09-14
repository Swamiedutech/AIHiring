const { sequelize, Sequelize } = require('./src/config/db');
const { Candidate } = require('./src/models');

async function migrate() {
  try {
    const candidates = await Candidate.findAll({
      where: {
        [Sequelize.Op.or]: [
          { resume_path: { [Sequelize.Op.like]: '%\\%' } },
          { profile_image_path: { [Sequelize.Op.like]: '%\\%' } }
        ]
      }
    });

    console.log(`Found ${candidates.length} rows to migrate.`);

    for (const c of candidates) {
      const updates = {};
      if (c.resume_path && c.resume_path.includes('\\')) {
        updates.resume_path = c.resume_path.replace(/\\/g, '/');
      }
      if (c.profile_image_path && c.profile_image_path.includes('\\')) {
        updates.profile_image_path = c.profile_image_path.replace(/\\/g, '/');
      }
      await c.update(updates);
    }
    console.log("Migration complete.");
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
}

migrate();
