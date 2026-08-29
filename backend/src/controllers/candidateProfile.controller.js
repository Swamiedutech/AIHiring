const {
  Application, Candidate, User,
  TechnicalRound, Interview,
  MalpracticeEvent, Offer, Job, HRInternalNote,
  ResumeAnalysis, AssessmentAnalysis, InterviewAnalysis,
  ApplicationStatusLog, TechnicalQuestionBank, MCQQuestion, InterviewQuestionBank
} = require('../models');
const { Op } = require('sequelize');
const { STATUS_GROUPS, computeApplicationScore, getFitBand } = require('../utils/applicationStatus.utils');

// ── EXACT enum values from your DB (verified via pg_enum query) ───
const ALL_STATUSES = [
  'APPLIED',
  'RESUME_SUBMITTED',
  'RESUME_EVALUATED',
  'TECHNICAL_ROUND_PENDING',
  'TECHNICAL_ROUND_IN_PROGRESS',
  'TECHNICAL_ROUND_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_IN_PROGRESS',
  'INTERVIEW_COMPLETED',
  'HR_REVIEW',
  'SELECTED',
  'REJECTED',
];

class CandidateProfileController {

  /**
   * GET /hr/candidate/:applicationId
   */
  static async getCandidateProfile(req, res) {
    try {
      const { applicationId } = req.params;

      if (!applicationId || applicationId === 'undefined' || applicationId === 'null') {
        return res.status(400).json({
          success: false,
          message: 'applicationId is missing. Check that useParams() key matches :applicationId in your route.'
        });
      }

    const application = await Application.findByPk(applicationId, {
      attributes: [
        'id', 'candidate_id', 'job_id', 'status', 'resume_score', 
        'technical_score', 'interview_score', 'overall_score', 'hr_decision', 
          'hr_notes', 'summary', 'applied_at', 'created_at', 'updated_at',
          'experience_years', 'skills', 'cgpa', 'year_of_passout',
          'final_decision', 'role_recommendation', 'fit_breakdown', 'ai_rationale', 'success_probability'
        ],
        include: [
          { 
            model: Candidate, 
            attributes: ['id', 'user_id', 'phone', 'location', 'education', 'specialization', 'skills', 'cgpa', 'year_of_passout', 'summary', 'ai_summary', 'integrity_score', 'resume_path', 'profile_image_path', 'candidate_type', 'domain', 'area_of_interest', 'current_company', 'working_address', 'experience_years'],
            include: [{ model: User, attributes: ['id', 'name', 'email'] }] 
          },
          { model: TechnicalRound, required: false, attributes: ['id', 'score', 'status', 'ai_feedback'] },
          { model: Interview,      required: false, attributes: ['id', 'ai_score', 'ai_summary', 'hire_recommendation', 'status'] },
          { model: Offer,          as: "offer", required: false, attributes: ['id', 'salary', 'joining_date', 'status'] },
          { model: ResumeAnalysis, required: false, attributes: ['id', 'strengths', 'weaknesses', 'why_to_hire', 'ai_model_used', 'overall_score', 'ai_summary', 'total_years_experience', 'jd_match_score', 'contact_info', 'education', 'skills'] },

          { model: AssessmentAnalysis, required: false, attributes: ['id', 'strengths', 'weaknesses', 'ai_model_used', 'overall_score', 'detailed_feedback', 'improvement_areas', 'estimated_skill_level', 'correctness_score', 'test_name'] },
          { 
            model: InterviewAnalysis, 
            required: false, 
            attributes: [
              'id', 'strengths', 'weaknesses', 'ai_model_used', 'overall_score', 'qa_pairs', 
              'detailed_evaluation', 'interview_session_id', 'technical_knowledge_score',
              'problem_solving_score', 'communication_score', 'soft_skills_score', 'cultural_fit_score',
              'confidence_level', 'communication_style', 'pace', 'clarity', 'hesitation_level',
              'vocabulary_level', 'predicted_on_job_performance', 'team_fit_assessment', 'growth_trajectory',
              'hire_recommendation', 'time_to_productivity_months', 'retention_probability_percentage'
            ] 
          },
          { model: Job,           required: false, attributes: ['id', 'title', 'department'] },
          { 
            model: require('../models').InterviewSession, 
            as: 'interview_session',
            required: false, 
            // Include questions_asked so response_text is available in the trace table
            attributes: ['id', 'recording_path', 'answers_provided', 'ai_analysis',
                         'questions_asked', 'started_at', 'ended_at', 'status', 'highlights',
                         'overall_score', 'hire_recommendation'] 
          },
          { 
            model: require('../models').MalpracticeEvent,
            required: false,
            attributes: ['id', 'type', 'severity', 'created_at']
          },
          {
            model: require('../models').AssessmentAttempt,
            as: 'assessment_attempts',
            required: false,
            attributes: ['id', 'assessment_type', 'status', 'final_score', 'structure_score', 'concept_coverage', 'answers', 'ml_score', 'ai_score', 'anti_cheating_data', 'started_at', 'submitted_at', 'ai_feedback', 'metadata']
          }
        ]
      });

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const user      = application.Candidate?.User;
      const technical = application.TechnicalRound;
      const interview = application.Interview;

      const resumeScore    = application.ResumeAnalysis?.overall_score || application.resume_score || 0;
      const technicalScore = technical?.score || application.AssessmentAnalysis?.overall_score || application.technical_score || 0;
      const interviewScore = interview?.ai_score || application.InterviewAnalysis?.overall_score || application.interview_score || 0;

      // Sync application table if discrepancy found (for real-time consistency)
      if (resumeScore !== application.resume_score) {
        application.update({ resume_score: resumeScore }).catch(err => console.error("Sync error:", err));
      }


      const aggregateScore = computeApplicationScore({
        overallScore: application.overall_score,
        resumeScore,
        technicalScore,
        interviewScore,
        malpracticeWarnings: application.malpractice_warnings || 0
      });

      const fitBand = getFitBand(aggregateScore);
      const aiFitBand = fitBand === 'high_fit' ? 'GOOD'
        : fitBand === 'avg_fit' ? 'AVERAGE'
        : 'WEAK';

      let malpractice = [];
      let notes = [];
      let enrichedAttempts = [];

      // Enrich Assessment Attempts with Question Text
      const rawAttempts = application.assessment_attempts || [];
      const allQIds = new Set();
      rawAttempts.forEach(att => {
        let answers = att.answers;
        if (typeof answers === 'string') {
          try { answers = JSON.parse(answers); } catch (e) { answers = {}; }
        }
        // Also collect question IDs from metadata.question_ids (for trace enrichment)
        const metaQIds = att.metadata?.question_ids || [];
        if (answers) {
          Object.keys(answers).forEach(id => {
            if (id && id !== 'null' && id !== 'undefined') allQIds.add(id);
          });
        }
        // Add metadata question IDs too (even if answers is empty)
        metaQIds.forEach(id => { if (id) allQIds.add(String(id)); });
      });

      const questionMap = {};
      if (allQIds.size > 0) {
        const ids = Array.from(allQIds).map(id => String(id).trim());
        
        // Filter IDs to only valid UUIDs to prevent Postgres from throwing "invalid input syntax for type uuid"
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const uuidIds = ids.filter(id => uuidRegex.test(id));
        
        // 1. TechnicalQuestionBank - Fetch by both questionId and ID
        if (uuidIds.length > 0) {
          const techQuestions = await TechnicalQuestionBank.findAll({
            where: {
              [Op.or]: [
                { questionId: { [Op.in]: uuidIds } },
                { questionId: { [Op.in]: uuidIds.map(id => id.toLowerCase()) } }
              ]
            },
            attributes: ['questionId', 'question', 'correct_answer', 'expected_answer']
          });

          techQuestions.forEach(q => {
            const qData = { text: q.question || "N/A", correct: q.correct_answer || q.expected_answer || "N/A" };
            if (q.questionId) {
              questionMap[q.questionId.trim()] = qData;
              questionMap[q.questionId.toLowerCase().trim()] = qData;
              questionMap[String(q.questionId).trim()] = qData;
            }
          });
        }

        // 2. MCQQuestion - Fetch by ID
        const mcqIds = ids.filter(id => !isNaN(parseInt(id, 10)));
        if (mcqIds.length > 0) {
          const mcqQuestions = await MCQQuestion.findAll({
            where: { id: { [Op.in]: mcqIds.map(id => parseInt(id, 10)) } },
            attributes: ['id', 'question', 'correct_option']
          });
          mcqQuestions.forEach(q => {
            const qData = { text: q.question, correct: q.correct_option };
            questionMap[String(q.id)] = qData;
          });
        }

        // 3. InterviewQuestionBank - Fetch by questionId
        const intQuestions = await InterviewQuestionBank.findAll({
          where: {
            [Op.or]: [
              { questionId: { [Op.in]: ids } },
              { questionId: { [Op.in]: ids.map(id => id.toLowerCase()) } }
            ]
          },
          attributes: ['questionId', 'question', 'expectedAnswer']
        });
        intQuestions.forEach(q => {
          const qData = { text: q.question, correct: q.expectedAnswer };
          if (q.questionId) {
            questionMap[q.questionId.trim()] = qData;
            questionMap[q.questionId.toLowerCase().trim()] = qData;
          }
        });
      }

      // Enrich Interview Analysis Q&A with Question Bank data
      if (application.InterviewAnalysis && application.InterviewAnalysis.qa_pairs) {
        const enrichedQA = application.InterviewAnalysis.qa_pairs.map((pair) => {
          const qId = pair.question_id || pair.id;
          if (qId && questionMap[qId]) {
             return {
               ...pair,
               question_text: questionMap[qId].text,
               expected_answer: questionMap[qId].correct
             };
          }
          return pair;
        });
        application.InterviewAnalysis.qa_pairs = enrichedQA;
      }

      enrichedAttempts = rawAttempts.map(att => {
        const attObj = att.get({ plain: true });
        let answers = attObj.answers;
        if (typeof answers === 'string') {
          try { answers = JSON.parse(answers); } catch (e) { answers = {}; }
        }
        answers = answers || {};

        // If answers is empty but metadata has question_ids, build skeleton trace entries
        const metaQIds = attObj.metadata?.question_ids || [];
        if (Object.keys(answers).length === 0 && metaQIds.length > 0) {
          metaQIds.forEach(qId => {
            const qIdStr = String(qId);
            if (!answers[qIdStr]) {
              answers[qIdStr] = { answer_text: null, question_text: null };
            }
          });
        }

        const enrichedAnswers = {};
        Object.keys(answers).forEach(qId => {
          enrichedAnswers[qId] = {
            ...answers[qId],
            question_text: answers[qId]?.question_text || questionMap[qId]?.text || questionMap[String(qId).toLowerCase()]?.text || `Question ID: ${qId}`,
            // STRIPPED: correct_answer is intentionally removed to prevent leaking the answer key
            answer_text: answers[qId]?.answer_text || null
          };
        });
        attObj.answers = enrichedAnswers;
        return attObj;
      });

      try {
        malpractice = await MalpracticeEvent.findAll({
          where: { application_id: applicationId },
          order: [['created_at', 'DESC']], limit: 20
        });
      } catch (_) {}

      try {
         notes = await HRInternalNote.findAll({
            where: { applicationId },
            order: [['created_at', 'DESC']],
            include: [{ model: User, as: 'author', attributes: ['name', 'role'] }]
         });
      } catch (_) {}

      return res.status(200).json({
        success: true,
        data: {
          id:               application.id,
          _id:              String(application.id),
          candidate: {
            id:             application.candidate_id,
            name:           user?.name  || 'N/A',
            email:          user?.email || 'N/A',
            phone:          application.Candidate?.phone || null,
            location:       application.Candidate?.location || null,
            education:      application.Candidate?.education || null,
            specialization: application.Candidate?.specialization || null,
            experience:     application.Candidate?.experience_years || application.experience_years || 0,
            skills:         application.Candidate?.skills || application.skills || [],
            cgpa:           application.Candidate?.cgpa || application.cgpa || null,
            year_of_passout: application.Candidate?.year_of_passout || application.year_of_passout || null,
            summary:         application.summary || application.Candidate?.summary || null,
            aiSummary:       application.Candidate?.ai_summary || null,
            profileImage:    application.Candidate?.profile_image_path ? `http://localhost:5000${application.Candidate.profile_image_path.startsWith('/') ? '' : '/'}${application.Candidate.profile_image_path}` : "/images/default-avatar.png",
            // ── Fresher / Working Professional fields ──
            candidate_type:    application.Candidate?.candidate_type || null,
            domain:            application.Candidate?.domain || null,
            area_of_interest:  application.Candidate?.area_of_interest || null,
            current_company:   application.Candidate?.current_company || null,
            working_address:   application.Candidate?.working_address || null,
          },
          job: {
            id:             application.job_id,
            title:          application.Job?.title || 'N/A',
            department:     application.Job?.department || 'N/A',
          },
          status:           application.status,
          stage:            application.status,
          assessment_attempts: enrichedAttempts,
          assessmentAnalysis: application.AssessmentAnalysis,
          appliedAt:        application.applied_at || application.createdAt,
          resumeUrl:        application.resume_url ? `http://localhost:5000${application.resume_url}` : (application.Candidate?.resume_path ? `http://localhost:5000${application.Candidate.resume_path}` : null),

          aiScore:          aggregateScore,
          aiFitBand,
          integrityScore:   application.Candidate?.integrity_score || 100,
          malpractice_events: application.MalpracticeEvents || [],

          scores: {
            resume: resumeScore,
            technical: technicalScore, interview: interviewScore,
            aggregate: aggregateScore,
          },

          evaluationProsCons: await buildProsCons(
            { jobId: application.job_id, resumeScore, technicalScore, interviewScore, malpracticeScore: malpractice.length || 0 }, 
            { 
              resumeAnalysis: application.ResumeAnalysis, 
              assessmentAnalysis: application.AssessmentAnalysis, 
              interviewAnalysis: application.InterviewAnalysis,
              interview
            }
          ),

          whyToHire: application.ResumeAnalysis?.why_to_hire || null,

          technicalData: technical ? { id: technical.id, score: technical.score, status: technical.status, feedback: technical.ai_feedback } : null,
          interviewData: interview ? { score: interview.ai_score, summary: interview.ai_summary, recommendation: interview.hire_recommendation, status: interview.status } : null,
          interviewAnalysis: application.InterviewAnalysis ? {
            ...application.InterviewAnalysis.get({ plain: true }),
            id: application.InterviewAnalysis.id,
          } : null,
          offerData: application.offer ? { salary: application.offer.salary, joiningDate: application.offer.joining_date, status: application.offer.status } : null,
          
          // Use the aliased association 'interview_session' (lowercase)
          interviewHighlights: application.interview_session ? (() => {
            const session = application.interview_session;
            const questionsWithRecording = (session.questions_asked || []).filter(q => q.recording_path);
            const firstWithVideo = questionsWithRecording[0];
            const recordingBase = session.recording_path || firstWithVideo?.recording_path;
            return {
              videoUrl: recordingBase ? `http://localhost:5000${recordingBase}` : null,
              sessionId: session.id,
              status: session.status,
              overallScore: session.overall_score,
              hireRecommendation: session.hire_recommendation,
              startedAt: session.started_at,
              endedAt: session.ended_at,
              // Per-question highlights with timestamps and recorded clips
              highlights: (session.questions_asked || []).map((ans, idx) => ({
                question: ans.question_text || ans.question || `Question ${idx + 1}`,
                timestamp: ans.answered_at ? new Date(ans.answered_at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }) : '00:00',
                duration: ans.response_duration_seconds || 45,
                score: ans.analysis?.relevance ? Math.round(ans.analysis.relevance * 100) : 0,
                confidence: ans.analysis?.confidence ? (ans.analysis.confidence > 0.7 ? 'High' : 'Medium') : 'N/A',
                sentiment: ans.analysis?.sentiment ? (ans.analysis.sentiment > 0.6 ? 'Positive' : 'Neutral') : 'N/A',
                responseText: ans.response_text || '',
                recordingPath: ans.recording_path ? `http://localhost:5000${ans.recording_path}` : null,
                keywords: ans.analysis?.keywords || []
              })),
              // Session-level highlights from AI analysis
              aiHighlights: session.highlights || []
            };
          })() : null,

          // FIX: Integrity Risk - uses malpractice fetched above with correct field names
          proctoringSummary: {
            integrityScore: Math.max(0, 100 - (malpractice.length * 10)),
            malpracticeWarnings: malpractice.length,
            violations: malpractice.map(e => ({
              type: e.type,
              severity: e.severity || 1,
              createdAt: e.created_at,
              meta: e.meta || {}
            }))
          },

          malpracticeEvents: malpractice.map(e => ({ type: e.event_type || e.type, severity: e.severity, timestamp: e.created_at })),
          
          final_decision: application.final_decision,
          role_recommendation: application.role_recommendation,
          fit_breakdown: application.fit_breakdown,
          ai_rationale: application.ai_rationale,
          success_probability: application.success_probability,

          internalNotes: notes.map(n => ({
            id: n.id, content: n.content, type: n.noteType,
            author: n.author?.name || 'System', version: n.version,
            created_at: n.created_at
          })),
          approvals: {
            totalNeeded: 1,
            received: ['RECOMMENDED_BY_AI', 'SELECTED', 'OFFERED'].includes(application.status) ? 1 : 0,
            records: application.hr_decision ? [{
              reviewer: 'HR', decision: application.hr_decision,
              reason: application.hr_notes, timestamp: application.updated_at, order: 1,
            }] : [],
          },
          // FIX: Evaluation Traces - use ApplicationStatusLog (actual audit trail) with proper comments column
          auditLogs: {
            statusLogs: await ApplicationStatusLog.findAll({
              where: { application_id: applicationId },
              order: [['created_at', 'DESC']],
              limit: 50
            }),
            approvalRecords: await ApplicationStatusLog.findAll({
              where: { application_id: applicationId },
              order: [['created_at', 'DESC']],
              limit: 50
            }).then(logs => logs.map(log => ({
              decision: log.new_status,
              approvalStage: log.previous_status || 'INITIAL',
              comments: log.reason || log.metadata?.reason || `Status changed to ${log.new_status}`,
              reviewer: { name: log.changed_by === 'SYSTEM_AUTO_REJECTION' ? 'System AI' : (log.changed_by ? `User #${log.changed_by}` : 'HR System') },
              timestamp: log.created_at
            })))
          },
          interview_session: application.interview_session || null
        }
      });

    } catch (error) {
      console.error('Error fetching candidate profile:', error);
      return res.status(500).json({ success: false, message: 'Error fetching candidate profile' });
    }
  }

  /**
   * GET /hr/candidates/:candidateId
   * Fetch candidate details by Candidate ID (used by Talent Pool)
   */
  static async getCandidateById(req, res) {
    try {
      const { candidateId } = req.params;

      // Find the latest application for this candidate to provide context
      const latestApp = await Application.findOne({
        where: { candidate_id: candidateId },
        order: [['created_at', 'DESC']],
        attributes: ['id']
      });

      if (latestApp) {
        // If they have an application, reuse the getCandidateProfile logic by redirecting or calling it
        req.params.applicationId = latestApp.id;
        return CandidateProfileController.getCandidateProfile(req, res);
      }

      // If no application, just return the candidate base info
      const candidate = await Candidate.findByPk(candidateId, {
        include: [{ model: User, attributes: ['name', 'email'] }]
      });

      if (!candidate) {
        return res.status(404).json({ success: false, message: 'Candidate not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: candidateId,
          candidate: {
            id: candidate.id,
            name: candidate.User?.name || 'N/A',
            email: candidate.User?.email || 'N/A',
            location: candidate.location,
            experience: candidate.experience_years,
            skills: candidate.skills || [],
            summary: candidate.summary,
            profileImage: candidate.profile_image_path ? `http://localhost:5000${candidate.profile_image_path.startsWith('/') ? '' : '/'}${candidate.profile_image_path}` : "/images/default-avatar.png",
            // ── Fresher / Working Professional fields ──
            candidate_type:   candidate.candidate_type || null,
            domain:           candidate.domain || null,
            area_of_interest: candidate.area_of_interest || null,
            current_company:  candidate.current_company || null,
            working_address:  candidate.working_address || null,
          },
          status: 'UNPROCESSED',
          scores: { resume: 0, technical: 0, interview: 0, aggregate: 0 },
          aiScore: 0,
          integrityScore: candidate.integrity_score || 100
        }
      });
    } catch (error) {
      console.error('Error in getCandidateById:', error);
      return res.status(500).json({ success: false, message: 'Error fetching candidate' });
    }
  }

  /**
   * GET /hr/pipeline
   */
  static async getPipelineCandidates(req, res) {
    try {
      const { fitBand, search, role, stage, minSkillMatch, sortByFitBand } = req.query;

        const applications = await Application.findAll({
          where: { status: { [Op.in]: STATUS_GROUPS.pipeline } },
          attributes: ['id', 'candidate_id', 'job_id', 'status', 'resume_score', 'technical_score', 'interview_score', 'overall_score', 'updated_at'],
          include: [
            { 
              model: Candidate, 
              attributes: ['id', 'user_id', 'integrity_score', 'profile_image_path'],
              include: [{ model: User, attributes: ['id', 'name', 'email'] }] 
            },
            { model: TechnicalRound, required: false, attributes: ['id', 'score'] },
            { model: Interview,      required: false, attributes: ['id', 'ai_score'] },
            { model: MalpracticeEvent, required: false, attributes: ['id'] },
            { model: Job, required: false, attributes: ['id', 'title'] }
          ],
          order: [['created_at', 'ASC']]
        });

        let candidates = applications.map(app => {
          const user        = app.Candidate?.User;
          const resumeScore = app.resume_score                         || 0;
          const techScore   = app.TechnicalRound?.score || app.technical_score || 0;
          const intScore    = app.Interview?.ai_score   || app.interview_score || 0;

          const aiScore = computeApplicationScore({
            overallScore: app.overall_score,
            resumeScore,
            technicalScore: techScore,
            interviewScore: intScore,
          });

          const fitBandVal = getFitBand(aiScore);
          const daysInStage = Math.floor((Date.now() - new Date(app.updated_at).getTime()) / 86400000);

          return {
            applicationId:     app.id,
            candidateId:       app.candidate_id,
            candidateName:     user?.name  || 'Unknown',
            candidateEmail:    user?.email || '',
            position:          app.Job?.title || 'N/A',
            applicationStatus: app.status,
            aiScore, fitBand: fitBandVal,
            integrityScore:    app.Candidate?.integrity_score || null,
            daysInStage, resumeScore, technicalScore: techScore, interviewScore: intScore,
            malpracticeCount:  app.MalpracticeEvents?.length || 0,
            profileImage: app.Candidate?.profile_image_path ? `http://localhost:5000${app.Candidate.profile_image_path.startsWith('/') ? '' : '/'}${app.Candidate.profile_image_path}` : null,
          };
        });

      if (fitBand && fitBand !== 'all') {
        candidates = candidates.filter(c => c.fitBand === fitBand);
      }
      
      if (search) {
        const q = search.toLowerCase();
        candidates = candidates.filter(c => 
          c.candidateName.toLowerCase().includes(q) || 
          String(c.candidateId).includes(q)
        );
      }

      if (role && role !== 'all') {
        candidates = candidates.filter(c => c.position === role);
      }

      if (stage && stage !== 'all') {
         // Optionally normalize if needed, but assuming exact backend status here
         candidates = candidates.filter(c => c.applicationStatus === stage);
      }

      if (minSkillMatch) {
         const threshold = parseInt(minSkillMatch, 10);
         if (!isNaN(threshold)) {
             candidates = candidates.filter(c => c.resumeScore >= threshold);
         }
      }

      if (sortByFitBand === 'true' || sortByFitBand === 'desc') {
         // Sort order logic: high_fit > avg_fit > low_fit
         const bandVal = { high_fit: 3, avg_fit: 2, low_fit: 1 };
         candidates.sort((a, b) => bandVal[b.fitBand] - bandVal[a.fitBand]);
      } else if (sortByFitBand === 'asc') {
         const bandVal = { high_fit: 3, avg_fit: 2, low_fit: 1 };
         candidates.sort((a, b) => bandVal[a.fitBand] - bandVal[b.fitBand]);
      }

      return res.status(200).json({ success: true, count: candidates.length, data: candidates });

    } catch (error) {
      console.error('Error fetching pipeline:', error);
      return res.status(500).json({ success: false, message: 'Error fetching pipeline data' });
    }
  }
}

const scoringService = require('../services/scoring.service');

async function buildProsCons({ jobId, resumeScore, technicalScore, interviewScore, malpracticeScore = 0 }, { resumeAnalysis, assessmentAnalysis, interviewAnalysis }) {
  // 1. Compute ML Regression Final Score & Classification
  const prediction = await scoringService.predictFinalScore({
    jobId,
    resumeScore: resumeScore || 0,
    assessmentScore: technicalScore || 0,
    interviewScore: interviewScore || 0,
    malpracticeScore: malpracticeScore || 0,
    aiAvailable: (resumeAnalysis?.ai_model_used?.includes('gemini') || interviewAnalysis?.method?.includes('AI'))
  });

  // Utility: Guarantee exactly 5 items, padding with intelligent role-based fallbacks
  const padTo5 = (items, fallbacks) => {
    const result = Array.isArray(items) ? [...items] : [];
    let i = 0;
    while (result.length < 5 && i < fallbacks.length) {
      if (!result.includes(fallbacks[i])) result.push(fallbacks[i]);
      i++;
    }
    const generic = [
      'Professional documentation standards met',
      'Industry awareness demonstrated',
      'Analytical approach observed',
      'Communication baseline established',
      'Commitment to role requirements shown'
    ];
    let j = 0;
    while (result.length < 5) { result.push(generic[j % generic.length]); j++; }
    return result.slice(0, 5);
  };

  const p = (score, goodFallbacks, badFallbacks, neutralFallback, aiStrengths = [], aiWeaknesses = [], modelUsed = '') => {
    const rawStrengths = Array.isArray(aiStrengths) ? aiStrengths : [];
    const rawWeaknesses = Array.isArray(aiWeaknesses) ? aiWeaknesses : [];

    const strengthFallbacks = score >= 70 ? goodFallbacks : [
      neutralFallback,
      'Candidate completed the evaluation stage',
      'Baseline competency acknowledged',
      'Participation demonstrates engagement',
      'Potential for role-specific training'
    ];
    const weaknessFallbacks = score < 60 ? badFallbacks : [
      'Advanced domain proficiency to be verified',
      'Practical experience depth requires validation',
      'Cross-functional collaboration history unclear',
      'Leadership demonstration scope limited',
      'Specialized certification gaps possible'
    ];

    return {
      pros: padTo5(rawStrengths, strengthFallbacks),
      cons: padTo5(rawWeaknesses, weaknessFallbacks),
      aiModel: modelUsed || 'system-hybrid-v1',
      isManual: modelUsed?.includes('fallback') || modelUsed?.includes('manual')
    };
  };
  
  const resume = p(
    resumeScore,
    ['Strong JD skill alignment', 'High keyword density for role', 'Relevant educational credentials', 'Domain experience highlighted', 'Quantifiable achievements present'],
    ['JD match below ideal threshold', 'Missing key technical skills', 'Limited relevant experience indicated', 'Education gap for role level', 'Achievement metrics unclear'],
    'Resume successfully parsed and evaluated',
    resumeAnalysis?.strengths, resumeAnalysis?.weaknesses, resumeAnalysis?.ai_model_used
  );
  
  const assessment = p(
    technicalScore,
    ['Strong technical accuracy across questions', 'Correct conceptual understanding shown', 'Structured problem-solving approach', 'Domain knowledge depth demonstrated', 'Efficient solution methodology'],
    ['Accuracy gaps in technical responses', 'Core concept understanding requires improvement', 'Problem-solving approach needs refinement', 'Domain knowledge verification recommended', 'Answer completeness below benchmark'],
    'Technical assessment completed and evaluated',
    assessmentAnalysis?.strengths, assessmentAnalysis?.weaknesses, assessmentAnalysis?.ai_model_used
  );
  
  const interviewRes = p(
    interviewScore,
    ['Clear and articulate communication', 'Confident response delivery observed', 'Structured answers with relevant examples', 'Strong role-scenario awareness', 'Professional interview presentation'],
    ['Communication clarity needs improvement', 'Response depth below expected level', 'Filler word usage impacts perception', 'Technical vocabulary limited for role', 'Scenario-based thinking requires enhancement'],
    'AI video interview evaluated',
    interviewAnalysis?.strengths, interviewAnalysis?.weaknesses, interviewAnalysis?.method
  );

  const aggregatedScore = prediction.finalScore;
  const finalRecommendation = prediction.classification === 'HIRE' ? 'Strong Hire' : prediction.classification === 'HOLD' ? 'Recommended' : 'Weak Fit';
  const reasoning = prediction.insights.recommendation +
    (malpracticeScore > 5 ? ` [Integrity Flag: Candidate had ${malpracticeScore} proctoring violation(s)]` : '');

  const finalStrengths = padTo5(
    prediction.insights.strengths,
    ['Completed full multi-stage evaluation pipeline', 'Demonstrated commitment through all assessment phases', 'Sufficient score to advance to HR review', 'Profile analyzed across resume, technical, and interview', 'Baseline fit established for role consideration']
  );
  const finalWeaknesses = padTo5(
    prediction.insights.weaknesses,
    ['Final decision pending HR panel review', 'Cross-stage performance consistency to verify', 'Role-specific training may be required', 'Peer benchmark comparison recommended', 'Reference verification suggested before final offer']
  );

  // Only include stages that the candidate has actually attempted
  const hasResume     = (resumeScore > 0) || !!resumeAnalysis;
  const hasAssessment = (technicalScore > 0) || !!assessmentAnalysis;
  const hasInterview  = (interviewScore  > 0) || !!interviewAnalysis;

  const result = [];

  if (hasResume) {
    result.push({ stage: 'RESUME_PARSING', overallScore: resumeScore, ...resume });
  }

  if (hasAssessment) {
    result.push({ stage: 'TECHNICAL_ASSESSMENT', overallScore: technicalScore, ...assessment });
  }

  if (hasInterview) {
    result.push({ stage: 'AI_INTERVIEW', overallScore: interviewScore, ...interviewRes });
  }

  // Only show final recommendation if at least one evaluation milestone is reached
  if (result.length > 0) {
    result.push({
      stage: 'FINAL_RECOMMENDATION',
      overallScore: aggregatedScore,
      decision: prediction.isComplete ? finalRecommendation : 'IN_PROGRESS',
      pros: finalStrengths,
      cons: finalWeaknesses,
      summary: reasoning,
      whyToHireReasoning: reasoning,
      confidence: prediction.confidence,
      method: prediction.methodUsed,
      isManual: resume.isManual || assessment.isManual || interviewRes.isManual
    });
  }

  return result;
}

module.exports = CandidateProfileController;
