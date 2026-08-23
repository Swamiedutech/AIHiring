const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const { authLimiter, aiLimiter, generalLimiter } = require("./middleware/rateLimiter.middleware");
const { globalErrorHandler, notFoundHandler } = require("./middleware/errorHandler.middleware");

const authRoutes = require("./routes/auth.routes");
const jobRoutes = require("./routes/job.routes");
const applicationRoutes = require("./routes/application.routes");
const resumeRoutes = require("./routes/resume.routes");
const hrRoutes = require("./routes/hr.routes");
console.log("✅ hr.routes loaded");
// TODO: mcq.routes file not yet created - commented out until it exists
// const mcqRoutes = require("./routes/mcq.routes");
const assessmentRoutes = require("./routes/assessment.routes"); 
const adminRoutes = require("./routes/admin.routes");
const interviewPhase5Routes = require("./routes/interviewPhase5.routes");
const malpracticeRoutes = require("./routes/malpractice.routes");
const offerRoutes = require("./routes/offer.routes");
const candidateRoutes = require("./routes/candidate.routes");
const candidateProfileRoutes = require("./routes/candidateProfile.routes");
const candidateDashboardRoutes = require("./routes/candidateDashboard.routes");
const mdRoutes = require("./routes/md.routes");
const proctoringRoutes = require("./routes/proctoring.routes");
const aiRoutes = require("./routes/ai.routes.complete");
const scoringRoutes = require("./routes/scoring.routes");
const notificationRoutes = require("./routes/notification.routes");
const aiInsightsRoutes = require("./routes/aiInsights.routes");
const talentPoolRoutes = require("./routes/talentPool.routes");
console.log("✅ ai.routes.complete loaded");
console.log("✅ scoring.routes loaded");

const app = express();

/* ================= MIDDLEWARE ================= */
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(helmet({
  crossOriginResourcePolicy: false, // Allows frontend to load images/PDFs from backend
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'self'", FRONTEND_URL, ...ALLOWED_ORIGINS],
    },
  },
  xFrameOptions: false, // Disabled in favor of CSP frameAncestors
}));
app.use(generalLimiter);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.options(/.*/, cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json());

/* ================= STATIC FILES ================= */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


app.use((req, res, next) => {
  console.log("🌍 Incoming:", req.method, req.url);
  next();
});
/* ================= ROUTES ================= */
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboard/candidate", candidateDashboardRoutes);

// TODO: MCQ routes commented out until mcq.routes file exists
// app.use("/api/mcq", mcqRoutes);              // Old MCQ system
app.use("/api/assessment", assessmentRoutes); // 🔥 NEW Production MCQ Engine

app.use("/api/hr", candidateProfileRoutes);
app.use("/api/interview", interviewPhase5Routes);
app.use("/api/malpractice", malpracticeRoutes);
app.use("/api/offer", offerRoutes);
app.use("/api/proctoring", proctoringRoutes);
app.use("/api/md", mdRoutes);
app.use("/api/ai", aiLimiter, aiRoutes); // 🔥 AI Analysis Pipeline
app.use("/api/score", scoringRoutes); // 🔥 Standalone Scoring Engine
app.use("/api/notifications", notificationRoutes);
app.use("/api/hr/ai-insights", aiInsightsRoutes);
app.use("/api/hr/talent-pool", talentPoolRoutes);

// Error Handling (Must be last)
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;