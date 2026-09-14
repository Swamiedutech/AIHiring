const { Candidate } = require("../models");

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No profile image uploaded",
      });
    }

    const profileImageUrl = `/uploads/profile-images/${req.file.filename}`;

    const candidate = await Candidate.findOne({
      where: { user_id: req.user.id },
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    await candidate.update({
      profile_image_path: profileImageUrl,
    });

    return res.status(200).json({
      success: true,
      data: {
        profile_image_path: profileImageUrl,
      },
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    return res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

