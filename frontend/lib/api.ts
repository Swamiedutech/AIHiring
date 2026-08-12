import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally — soft redirect, no hard reload loop
let isRedirecting = false;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !isRedirecting) {
      if (typeof window !== "undefined") {
        isRedirecting = true;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        // Use setTimeout to break out of the axios promise chain
        setTimeout(() => {
          window.location.replace("/login");
          isRedirecting = false;
        }, 100);
      }
    }
    return Promise.reject(err);
  }
);

// ==================== AUTH ====================
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post("/auth/register", data),
  verifyOTP: (data: { email: string; otp: string }) =>
    api.post("/auth/verify-otp", data),
  resendOTP: (data: { email: string }) =>
    api.post("/auth/resend-otp", data),
  logout: () => api.post("/auth/logout"),
  updateProfile: (data: { name: string; email: string }) =>
    api.put("/auth/profile", data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put("/auth/change-password", data),
};

// ==================== ADMIN ====================
export const adminApi = {
  // Dashboard
  getStats: () => api.get("/admin/dashboard/stats"),
  getHiringTrend: () => api.get("/admin/dashboard/hiring-trend"),
  getRoleApplications: () => api.get("/admin/dashboard/role-applications"),
  getFunnel: () => api.get("/admin/dashboard/funnel"),
  getApprovalBottleneck: () => api.get("/admin/dashboard/approval-bottleneck"),
  getSystemHealth: () => api.get("/admin/dashboard/system-health"),

  // Jobs
  getJobs: () => api.get("/admin/jobs"),
  getJob: (id: string) => api.get(`/admin/jobs/${id}`),
  createJob: (data: object) => api.post("/admin/jobs", data),
  updateJob: (id: string, data: object) => api.put(`/admin/jobs/${id}`, data),
  activateJob: (id: string) => api.patch(`/admin/jobs/${id}/activate`),
  closeJob: (id: string) => api.patch(`/admin/jobs/${id}/close`),
  deleteJob: (id: string) => api.delete(`/admin/jobs/${id}`),

  // AI Config
  getAIConfigs: () => api.get("/admin/ai-config"),
  getAIConfig: (jobId: string) => api.get(`/admin/ai-config/job/${jobId}`),
  createAIConfig: (data: object) => api.post("/admin/ai-config", data),
  updateAIConfig: (id: string, data: object) => api.put(`/admin/ai-config/${id}`, data),
  testAIConfig: (id: string) => api.post(`/admin/ai-config/${id}/test`),

  // AI Models
  getAIModels: () => api.get("/admin/ai-models"),
  deployAIModel: (data: object) => api.post("/admin/ai-models", data),
  activateAIModel: (id: string) => api.patch(`/admin/ai-models/${id}/activate`),
  rollbackAIModel: (id: string) => api.post(`/admin/ai-models/${id}/rollback`),

  // Workflows
  getWorkflows: () => api.get("/admin/workflows"),
  createWorkflow: (data: object) => api.post("/admin/workflows", data),
  updateWorkflow: (id: string, data: object) => api.put(`/admin/workflows/${id}`, data),

  // Offer Templates
  getOfferTemplates: () => api.get("/admin/offer-templates"),
  getOfferTemplate: (id: string) => api.get(`/admin/offer-templates/${id}`),
  createOfferTemplate: (data: object) => api.post("/admin/offer-templates", data),
  updateOfferTemplate: (id: string, data: object) => api.put(`/admin/offer-templates/${id}`, data),

  // Audit
  getAuditLogs: (params?: object) => api.get("/admin/audit-logs", { params }),
  exportAuditLogs: (format: string) => api.get("/admin/audit-logs/export", { params: { format }, responseType: 'blob' }),
  getAuditStats: () => api.get("/admin/audit-logs/stats"),
  searchAuditLogs: (params?: object) => api.get("/admin/audit-logs/search", { params }),
  getDataRetentionPolicy: () => api.get("/admin/data-retention-policy"),
  updateDataRetentionPolicy: (data: object) => api.put("/admin/data-retention-policy", data),
  getSystemHealthAudit: () => api.get("/admin/system-health"),
  triggerAiRetry: (data: { applicationId: string; taskType: string }) => api.post("/admin/audit-logs/retry-ai", data),

  // HR Management
  getHRs: () => api.get("/admin/hrs"),
  createHR: (data: object) => api.post("/admin/hrs", data),
  updateHR: (id: string, data: object) => api.put(`/admin/hrs/${id}`, data),
  deleteHR: (id: string) => api.delete(`/admin/hrs/${id}`),
  forceLogoutHR: (id: string) => api.post(`/admin/hrs/${id}/force-logout`),

  // Approval Rules
  getApprovalRules: () => api.get("/admin/approval-rules"),
  createApprovalRule: (data: object) => api.post("/admin/approval-rules", data),

  // Notifications & Global Toggles
  getNotifications: () => api.get("/admin/notifications"),
  updateSystemToggle: (data: { feature: string; enabled: boolean }) => 
    api.patch("/admin/system-toggles", data),
};

// ==================== HR ====================
export const hrApi = {
  // Dashboard
  getKPICards: () => api.get("/hr/dashboard/kpi"),
  getHiringFunnel: () => api.get("/hr/dashboard/funnel"),
  getStatusDistribution: () => api.get("/hr/dashboard/distribution"),
  getSkillsHeatmap: () => api.get("/hr/dashboard/skills-heatmap"),
  getPendingActions: () => api.get("/hr/dashboard/pending-actions"),
  getAIvsHR: () => api.get("/hr/dashboard/ai-vs-hr"),
  getDashboardOverview: () => api.get("/hr/dashboard/overview"),
  getTimeToHire: () => api.get("/hr/dashboard/time-to-hire"),
  getRejectionReasons: () => api.get("/hr/dashboard/rejection-reasons"),

  // Applications / Pipeline
  getApplications: (params?: any) => api.get("/hr/applications", { params }),
  getPipeline: (params?: any) => api.get("/hr/pipeline", { params }),
  getCandidateProfile: (applicationId: string) =>
    api.get(`/hr/applications/${applicationId}`),
  getCandidateById: (candidateId: string) =>
    api.get(`/hr/candidates/${candidateId}`),
  getRiskMonitor: (params?: any) =>
    api.get("/hr/risk-monitor", { params }),

  // Decisions
  makeDecision: (applicationId: string, data: any) =>
    api.post(`/hr/decision/${applicationId}`, data),
  getPendingApprovals: (applicationId: string) =>
    api.get(`/hr/approvals/${applicationId}`),
  escalateDecision: (applicationId: string) =>
    api.post(`/hr/escalate/${applicationId}`),
  requestReInterview: (applicationId: string) =>
    api.post(`/hr/request-reinterview/${applicationId}`),
  getApprovalRules: () => api.get("/hr/approval-rules"),

  // Offers
  createOffer: (data: object) => api.post("/offer/create", data),
  getDispatchedOffers: () => api.get("/offer/dispatched"),

  // Notifications
  getNotifications: () => api.get("/hr/notifications"),

  // Internal Notes & Ops
  addInternalNote: (applicationId: string, content: string) =>
    api.post(`/hr/add-note/${applicationId}`, { content }),
  reEvaluateAssessment: (applicationId: string) =>
    api.post("/ai/re-evaluate", { applicationId }),

  getExecutiveReport: (applicationId: string) =>
    api.get(`/hr/reports/executive/${applicationId}`, { responseType: 'blob' }),

  getAssessmentReport: (applicationId: string) =>
    api.get(`/hr/report/${applicationId}`, { responseType: 'blob' }),

  getInterviewReport: (applicationId: string) =>
    api.get(`/hr/report/interview/${applicationId}`, { responseType: 'blob' }),

  triggerDecision: (applicationId: string) =>
    api.post(`/hr/applications/${applicationId}/decide`),

  getBenchmark: (applicationId: string) =>
    api.get(`/hr/applications/${applicationId}/benchmark`),

  viewResume: (applicationId: string) =>
    api.get(`/hr/resume/${applicationId}`, { responseType: 'blob' }),

  getOperationalCore: () =>
    api.get('/hr/dashboard/operational-core'),

  getTopCandidates: () =>
    api.get('/hr/dashboard/top-candidates'),
  getJobs: () =>
    api.get('/hr/jobs'),
  
  // Offer Template Management
  getOfferTemplates: () => api.get("/offer/templates"),
  createOfferTemplate: (data: any) => api.post("/offer/templates", data),
  updateOfferTemplate: (id: string, data: any) => api.put(`/offer/templates/${id}`, data),

  // Assessment Analysis
  analyzeAssessment: (applicationId: string) => api.post(`/assessment/analyze/${applicationId}`),

  // MD Decisions feed
  getMDDecisions: () => api.get('/hr/dashboard/md-decisions'),

  // Recent Hires feed
  getRecentHires: () => api.get('/hr/dashboard/recent-hires'),
};

// ==================== MD ====================
export const mdApi = {
  getDashboard: () => api.get("/dashboard/md/overview"),
  getNotifications: () => api.get("/md/notifications"),
  viewResume: (applicationId: string) =>
    api.get(`/hr/resume/${applicationId}`, { responseType: 'blob' }),
};

// ==================== CANDIDATE ====================
export const candidateApi = {
  getDashboard: () => api.get("/dashboard/candidate/overview"),
  getApplicationDetails: (id: string) =>
    api.get(`/dashboard/candidate/application/${id}`),
  getNextAction: (id: string) =>
    api.get(`/dashboard/candidate/application/${id}/next-action`),

  // Resume
  uploadResume: (formData: FormData) =>
    api.post("/dashboard/candidate/resume/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  autofillFromResume: () =>
    api.post("/dashboard/candidate/resume/autofill"),
  uploadProfileImage: (formData: FormData) =>
    api.post("/dashboard/candidate/profile-image/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateProfile: (data: {
    education?: string;
    specialization?: string;
    experience_years?: number;
    phone?: string;
    location?: string;
    skills?: string[];
    cgpa?: number;
    year_of_passout?: number;
    summary?: string;
    // Fresher / Working Professional
    candidate_type?: string;
    domain?: string;
    area_of_interest?: string;
    current_company?: string;
    working_address?: string;
  }) => api.put("/dashboard/candidate/profile", data),

  // Assessment
  // ✅ FIXED (IMPORTANT)
  getAssessmentConfig: () => api.get("/assessment/config"),
  startAssessment: (applicationId: string) =>
    api.get(`/assessment/application/${applicationId}/start`),

  saveAssessmentAnswer: (attemptId: string, questionId: string, answerText: string, section?: number) =>
    api.post(`/assessment/${attemptId}/answer`, { question_id: questionId, answer_text: answerText, section }),

  saveAllAnswers: (attemptId: string, answers: Record<string, { answer_text: string; section: number }>) =>
    api.post(`/assessment/${attemptId}/answers`, { answers }),


  // ✅ FIXED
  submitAssessment: (attemptId: string) =>
    api.post(`/assessment/${attemptId}/submit`),

  // ✅ FIXED
  getAssessmentStatus: (attemptId: string) =>
    api.get(`/assessment/${attemptId}/status`),

  // Interview
  // ================= INTERVIEW PHASE 5 =================
  getInterviewConfig: () => api.get("/interview/config"),

startInterviewPhase5: (applicationId: string) =>
  api.post(`/interview/application/${applicationId}/start`),

submitResponsePhase5: (sessionId: string, data: any) =>
  api.post(`/interview/${sessionId}/response`, data),

getInterviewStatusPhase5: (sessionId: string) =>
  api.get(`/interview/${sessionId}/status`),

getInterviewStatus: (applicationId: string) =>
  api.get(`/interview/application/${applicationId}/status`),

  // Offer
  getOfferDetails: (applicationId: string) => 
    api.get(`/offer/application/${applicationId}`),
  respondOffer: (data: { offer_id?: string; application_id?: string; decision: string; candidate_notes?: string }) => 
    api.post("/offer/respond-to-offer", data),

  getNotifications: () => api.get("/notifications/candidate/my"),

  logMalpractice: (referenceId: string, data: object) => 
    api.post("/proctoring/log-malpractice", { ...data, reference_id: referenceId }),

  // Jobs
  getJobs: () => api.get("/jobs"),
  applyJob: (data: object) => api.post("/applications", data),
};

// ==================== AI ====================
export const aiApi = {
  // Analytics
  getAnalytics: (jobId?: number, departmentId?: number, skillLevel?: string) => {
    const params = new URLSearchParams();
    if (jobId) params.append("jobId", jobId.toString());
    if (departmentId) params.append("departmentId", departmentId.toString());
    if (skillLevel) params.append("skillLevel", skillLevel);
    return api.get(`/ai/analytics${params.toString() ? `?${params}` : ""}`);
  },
  
  exportAnalytics: (data: { jobId?: number; departmentId?: number; skillLevel?: string }) =>
    api.post("/ai/analytics/export", data, {
      responseType: "blob",
    }),
  
  // Analysis
  getAnalysis: (applicationId: string) =>
    api.get(`/ai/analysis/${applicationId}`),
  
  // Decision
  makeDecision: (data: { applicationId: number; jobId?: number }) =>
    api.post("/ai/decision/make", data),
  
  // Chat
  chat: (message: string, history: any[] = []) =>
    api.post("/ai/chat", { message, history }),
};

// ==================== AI INSIGHTS ====================
export const aiInsightsApi = {
  getDashboardData: () => api.get("/hr/ai-insights/dashboard"),
  downloadInsights: () => api.get("/hr/ai-insights/download-insights", { responseType: 'blob' }),
  generateReport: () => api.post("/hr/ai-insights/generate-report"),
  analyzeSection: (section: string, currentData?: any) => api.post("/hr/ai-insights/analyze-section", { section, currentData }),
};

export const talentPoolApi = {
  getTalentPool: (params?: any) => api.get("/hr/talent-pool", { params }),
};

export default api;
