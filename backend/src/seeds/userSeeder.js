const { User } = require("../models");
const bcrypt = require("bcryptjs");

async function seedUsers() {
  try {
    const existing = await User.count();
    if (existing > 0) {
      console.log("✅ Users already exist. Skipping user seeding.");
      return;
    }

    if (process.env.NODE_ENV === "production") {
      console.log("❌ Seeding users is disabled in production.");
      return;
    }

    const crypto = require("crypto");
    const generatedPassword = crypto.randomBytes(8).toString("hex") + "A1!";
    console.log(`\n========================================`);
    console.log(`🔐 INITIAL ADMIN PASSWORD: ${generatedPassword}`);
    console.log(`========================================\n`);

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash(generatedPassword, salt);

    const users = [
      {
        name: "Admin User",
        email: "admin@example.com",
        password: password,
        role: "ADMIN",
        is_verified: true
      },
      {
        name: "HR User",
        email: "hr@example.com",
        password: password,
        role: "HR",
        is_verified: true
      },
      {
        name: "Candidate User",
        email: "candidate@example.com",
        password: password,
        role: "CANDIDATE",
        is_verified: true
      }
    ];

    await User.bulkCreate(users);
    console.log("✅ Default users seeded: admin@example.com, hr@example.com, candidate@example.com (password: password123)");
  } catch (error) {
    console.error("❌ Error seeding users:", error);
  }
}

module.exports = seedUsers;
