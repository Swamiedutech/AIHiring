const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const {
  sequelize,
  Application, Candidate, User, Job,
  AssessmentAttempt, TechnicalQuestionBank,
  MalpracticeEvent, InterviewSession, InterviewAnalysis,
  AssessmentAnalysis, ResumeAnalysis, ApplicationStatusLog,
  DocumentRecord
} = require('../models');

// ─────────────────────────────────────────────────────────────────
//  COLOUR PALETTE  (white-theme, no emojis)
// ─────────────────────────────────────────────────────────────────
const C = {
  accent: '#1e293b',   // Professional dark slate/navy
  accentL: '#f1f5f9',   // Very light slate for backgrounds
  green: '#166534',   // Deep green for success/positive
  greenL: '#f0fdf4',   // Light green
  red: '#991b1b',   // Deep red for flags/warnings
  redL: '#fef2f2',   // Light red
  amber: '#9a3412',   // Amber/burnt orange
  amberL: '#fff7ed',   // Light amber
  gray: '#475569',   // Slate gray
  muted: '#64748b',   // Lighter slate
  border: '#cbd5e1',   // Borders
  borderL: '#e2e8f0',   // Light borders
  text: '#0f172a',   // Almost black
  subtext: '#334155',   // Dark gray
  white: '#ffffff',
  light: '#f8fafc',
  divider: '#e2e8f0',
};

const PAGE_W = 595.28;   // A4 width  (pts)
const MARGIN = 45;
const CONTENT = PAGE_W - MARGIN * 2;   // 505.28

// ─────────────────────────────────────────────────────────────────
//  LAYOUT HELPERS
// ─────────────────────────────────────────────────────────────────

/** Top letterhead on every page */
function drawHeader(doc, reportType, candidateName, appId) {
  // White bar with blue left stripe
  doc.rect(0, 0, PAGE_W, 68).fill(C.white);
  doc.rect(0, 0, 5, 68).fill(C.accent);
  doc.rect(0, 68, PAGE_W, 1).fill(C.border);

  // Company name
  doc.fillColor(C.accent).font('Times-Bold').fontSize(8)
    .text('AI Hiring System INDUSTRIAL', MARGIN + 8, 14, { characterSpacing: 1.5 });

  // Report type
  doc.fillColor(C.text).font('Times-Bold').fontSize(17)
    .text(reportType, MARGIN + 8, 26);

  // Right side — candidate + app id
  doc.fillColor(C.gray).font('Times-Roman').fontSize(8)
    .text(`Candidate: ${candidateName}`, 0, 18, { align: 'right', width: PAGE_W - MARGIN - 8 });
  doc.fillColor(C.muted).font('Times-Roman').fontSize(7)
    .text(`Application #${appId}  |  CONFIDENTIAL`, 0, 30, { align: 'right', width: PAGE_W - MARGIN - 8 });

  doc.y = 78;
}

/** Bottom footer */
function drawFooter(doc) {
  const y = doc.page.height - 28;
  doc.rect(0, y - 4, PAGE_W, 1).fill(C.border);
  doc.rect(0, y - 5, 5, 33).fill(C.accent);
  doc.fillColor(C.muted).font('Times-Roman').fontSize(7)
    .text('AI Hiring System INDUSTRIAL  |  AI Recruitment Platform  |  Strictly Confidential',
      MARGIN + 8, y + 2, { align: 'left', width: CONTENT - 80 });
  doc.fillColor(C.accent).font('Times-Bold').fontSize(7)
    .text(`Page ${doc.bufferedPageRange ? doc.bufferedPageRange().start + doc.bufferedPageRange().count : ''}`,
      0, y + 2, { align: 'right', width: PAGE_W - MARGIN - 8 });
}

/** Section heading row */
function section(doc, label) {
  if (doc.y > 690) doc.addPage();
  doc.moveDown(1);
  doc.rect(MARGIN, doc.y, CONTENT, 22).fill(C.accentL);
  doc.rect(MARGIN, doc.y, 3, 22).fill(C.accent);
  doc.fillColor(C.accent).font('Times-Bold').fontSize(9)
    .text(label.toUpperCase(), MARGIN + 12, doc.y + 7, { characterSpacing: 0.8, width: CONTENT - 20 });
  doc.moveDown(1.8);
}

/** Horizontal rule */
function rule(doc) {
  doc.rect(MARGIN, doc.y, CONTENT, 0.5).fill(C.border);
  doc.moveDown(0.6);
}

/** Score card — clean white box */
function scoreCard(doc, x, y, w, label, value, total = 100) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const col = pct >= 70 ? C.green : pct >= 50 ? C.amber : C.red;
  const colL = pct >= 70 ? C.greenL : pct >= 50 ? C.amberL : C.redL;

  // Card border
  doc.rect(x, y, w, 64).fill(C.white).stroke(C.border);
  // Coloured top strip
  doc.rect(x, y, w, 3).fill(col);
  // Label
  doc.fillColor(C.muted).font('Times-Roman').fontSize(7)
    .text(label.toUpperCase(), x + 8, y + 10, { width: w - 16, characterSpacing: 0.5 });
  // Score value
  doc.fillColor(col).font('Times-Bold').fontSize(22)
    .text(`${pct}`, x + 8, y + 22, { width: w - 30 });
  doc.fillColor(C.muted).font('Times-Roman').fontSize(8).text(`/${total}`, x + 8 + 28, y + 30);
  // Progress bar track
  const bW = w - 16;
  doc.rect(x + 8, y + 52, bW, 3).fill(C.borderL);
  doc.rect(x + 8, y + 52, Math.round((pct / 100) * bW), 3).fill(col);
}

/** Status pill badge */
function pill(doc, text, x, y, bgColor, textColor) {
  text = String(text || '').toUpperCase();
  const tw = doc.widthOfString(text, { fontSize: 7 }) + 16;
  doc.rect(x, y, tw, 14).fill(bgColor);
  doc.fillColor(textColor).font('Times-Bold').fontSize(7)
    .text(text, x + 8, y + 3.5, { width: tw - 16 });
  return x + tw + 6;
}

/** 2-column info row */
function infoRow(doc, label, value) {
  const rowY = doc.y;
  doc.fillColor(C.muted).font('Times-Roman').fontSize(8)
    .text(label, MARGIN, rowY, { width: 150 });
  doc.fillColor(C.subtext).font('Times-Bold').fontSize(8)
    .text(String(value || 'N/A'), MARGIN + 155, rowY, { width: CONTENT - 155 });
  doc.moveDown(0.65);
}

// ─────────────────────────────────────────────────────────────────
//  ASSESSMENT PDF
// ─────────────────────────────────────────────────────────────────
exports.generateCandidateReport = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const [application, attempt, assmAnalysis, malpractice, auditLogs] = await Promise.all([
      Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, { model: Job }]
      }),
      AssessmentAttempt.findOne({
        where: { application_id: applicationId },
        order: [['created_at', 'DESC']]
      }),
      AssessmentAnalysis.findOne({ where: { application_id: applicationId } }),
      MalpracticeEvent.findAll({ where: { application_id: applicationId }, order: [['created_at', 'ASC']] }),
      ApplicationStatusLog.findAll({ where: { application_id: applicationId }, order: [['created_at', 'ASC']] })
    ]);

    if (!application) return res.status(404).json({ error: 'Application not found' });

    // 1. Fetch Questions from ALL potential banks
    let questions = [];
    const questionIds = attempt?.metadata?.question_ids || [];

    if (questionIds.length > 0) {
      const { MCQQuestion, InterviewQuestionBank } = require('../models');

      // Fetch from Technical Bank
      const techQ = await TechnicalQuestionBank.findAll({
        where: { questionId: questionIds }
      });

      // Fetch from MCQ Bank (numeric IDs)
      const mcqIds = questionIds.filter(id => !isNaN(parseInt(id, 10)));
      let mcqQ = [];
      if (mcqIds.length > 0) {
        mcqQ = await MCQQuestion.findAll({
          where: { id: { [Op.in]: mcqIds.map(id => parseInt(id, 10)) } }
        });
      }

      // Fetch from Interview Bank
      const intQ = await InterviewQuestionBank.findAll({
        where: { questionId: { [Op.in]: questionIds } }
      });

      // Merge and standardize
      const allFetched = [
        ...techQ.map(q => ({
          questionId: q.questionId,
          question: q.question,
          correct_answer: q.correct_answer || q.expected_answer,
          difficulty: q.difficulty,
          section_type: q.section_type || 'TECHNICAL',
          keywords: q.keywords
        })),
        ...mcqQ.map(q => ({
          questionId: String(q.id),
          question: q.question,
          correct_answer: q.correct_option,
          difficulty: 'MEDIUM',
          section_type: 'MCQ',
          keywords: []
        })),
        ...intQ.map(q => ({
          questionId: q.questionId,
          question: q.question,
          correct_answer: q.expectedAnswer,
          difficulty: q.difficulty,
          section_type: 'INTERVIEW',
          keywords: q.keywords
        }))
      ];

      // Sort to match metadata order
      questions = allFetched.sort((a, b) =>
        questionIds.indexOf(String(a.questionId)) - questionIds.indexOf(String(b.questionId))
      );
    }

    // Answer helper
    const rawAnswers = attempt?.answers || {};
    const getAnswer = (qid) =>
      rawAnswers[qid] || rawAnswers[String(qid)] || rawAnswers[qid?.toLowerCase?.()] || null;

    const candidateName = application.Candidate?.User?.name || 'N/A';
    const candidateEmail = application.Candidate?.User?.email || 'N/A';
    const jobTitle = application.Job?.title || 'N/A';
    const techScore = application.technical_score || 0;
    const resumeScore = application.resume_score || 0;
    const overallScore = application.overall_score || 0;
    const integrityPct = Math.max(0, 100 - (malpractice.length * 10));

    // ── Init PDF ──────────────────────────────────────────
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Assessment_Report_${candidateName.replace(/\s+/g, '_')}_App${applicationId}.pdf"`);
    doc.pipe(res);

    // Save Record to DB (async)
    const { DocumentRecord } = require('../models');
    DocumentRecord.findOne({ where: { application_id: applicationId, document_type: 'ASSESSMENT_REPORT' } })
      .then(existing => {
        if (existing) {
          return existing.update({ generated_at: new Date(), file_size: 1500000 });
        }
        return DocumentRecord.create({
          application_id: applicationId,
          document_type: 'ASSESSMENT_REPORT',
          file_name: `Assessment_Report_${candidateName.replace(/\s+/g, '_')}_App${applicationId}.pdf`,
          file_path: `/reports/assessment/${applicationId}.pdf`,
          file_size: 1500000,
          file_type: 'application/pdf',
          generated_at: new Date()
        });
      })
      .catch(err => console.error('Failed to save document record:', err));

    // ════════════════════════════════════════════════════
    //  PAGE 1 — CANDIDATE SUMMARY
    // ════════════════════════════════════════════════════
    drawHeader(doc, 'TECHNICAL ASSESSMENT REPORT', candidateName, applicationId);

    // ── Candidate Info Card ───────────────────────────
    doc.rect(MARGIN, doc.y, CONTENT, 78).fill(C.white).stroke(C.border);
    const cardY = doc.y + 12;
    doc.fillColor(C.text).font('Times-Bold').fontSize(15)
      .text(candidateName.toUpperCase(), MARGIN + 14, cardY, { width: CONTENT - 150 });
    doc.fillColor(C.gray).font('Times-Roman').fontSize(8.5)
      .text(`${candidateEmail}`, MARGIN + 14, cardY + 22);
    doc.fillColor(C.muted).font('Times-Roman').fontSize(8)
      .text(`${jobTitle}`, MARGIN + 14, cardY + 36);

    // Status pills
    let px = MARGIN + 14;
    const py = cardY + 52;
    px = pill(doc, application.status.replace(/_/g, ' '), px, py, C.accentL, C.accent);
    px = pill(doc, `Technical  ${techScore}%`, px, py,
      techScore >= 60 ? C.greenL : C.redL, techScore >= 60 ? C.green : C.red);
    px = pill(doc, `Resume  ${resumeScore}%`, px, py,
      resumeScore >= 60 ? C.greenL : C.amberL, resumeScore >= 60 ? C.green : C.amber);
    pill(doc, `Integrity  ${integrityPct}%`, px, py,
      integrityPct >= 80 ? C.greenL : C.redL, integrityPct >= 80 ? C.green : C.red);

    doc.y = doc.y + 90;
    doc.moveDown(0.5);

    // ── Score Matrix ─────────────────────────────────
    section(doc, 'Performance Score Matrix');
    const matY = doc.y;
    const cw = (CONTENT - 18) / 4;
    scoreCard(doc, MARGIN, matY, cw, 'Resume Score', resumeScore);
    scoreCard(doc, MARGIN + cw + 6, matY, cw, 'Technical Score', techScore);
    scoreCard(doc, MARGIN + (cw + 6) * 2, matY, cw, 'Overall Rating', overallScore);
    scoreCard(doc, MARGIN + (cw + 6) * 3, matY, cw, 'Integrity Score', integrityPct);
    doc.moveDown(5.5);

    // ── Assessment Meta ──────────────────────────────
    if (attempt) {
      section(doc, 'Assessment Session Details');
      const started = attempt.started_at ? new Date(attempt.started_at).toLocaleString() : 'N/A';
      const submitted = attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'N/A';
      const qCount = questionIds.length;
      const answered = Object.keys(rawAnswers).length;

      const halfW = (CONTENT - 10) / 2;
      const metaY = doc.y;
      // Left col
      doc.rect(MARGIN, metaY, halfW, 72).fill(C.light).stroke(C.border);
      doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('STARTED AT', MARGIN + 10, metaY + 10);
      doc.fillColor(C.text).font('Times-Bold').fontSize(8.5).text(started, MARGIN + 10, metaY + 22, { width: halfW - 20 });
      doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('SUBMITTED AT', MARGIN + 10, metaY + 42);
      doc.fillColor(C.text).font('Times-Bold').fontSize(8.5).text(submitted, MARGIN + 10, metaY + 54, { width: halfW - 20 });
      // Right col
      doc.rect(MARGIN + halfW + 10, metaY, halfW, 72).fill(C.light).stroke(C.border);
      doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('QUESTIONS', MARGIN + halfW + 20, metaY + 10);
      doc.fillColor(C.text).font('Times-Bold').fontSize(18)
        .text(`${answered} / ${qCount}`, MARGIN + halfW + 20, metaY + 20);
      doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('answered out of assigned', MARGIN + halfW + 20, metaY + 42);
      doc.fillColor(C.accent).font('Times-Bold').fontSize(8)
        .text(`Completion: ${qCount > 0 ? Math.round((answered / qCount) * 100) : 0}%`, MARGIN + halfW + 20, metaY + 55);

      doc.y = metaY + 80;
    }

    // ── AI Analysis (Strengths / Weaknesses) ─────────
    if (assmAnalysis) {
      section(doc, 'AI Assessment Analysis');
      const strengths = Array.isArray(assmAnalysis.strengths) ? assmAnalysis.strengths : [];
      const weaknesses = Array.isArray(assmAnalysis.weaknesses) ? assmAnalysis.weaknesses : [];
      const maxI = Math.max(strengths.length, weaknesses.length, 0);

      if (maxI > 0) {
        const colW = (CONTENT - 10) / 2;
        const swY = doc.y;

        // Headers
        doc.rect(MARGIN, swY, colW, 20).fill(C.greenL).stroke(C.border);
        doc.fillColor(C.green).font('Times-Bold').fontSize(8)
          .text('STRENGTHS', MARGIN + 10, swY + 6, { width: colW - 20 });
        doc.rect(MARGIN + colW + 10, swY, colW, 20).fill(C.redL).stroke(C.border);
        doc.fillColor(C.red).font('Times-Bold').fontSize(8)
          .text('AREAS FOR IMPROVEMENT', MARGIN + colW + 20, swY + 6, { width: colW - 20 });

        let rowY = swY + 26;
        for (let i = 0; i < maxI; i++) {
          if (rowY > 680) { doc.addPage(); drawHeader(doc, 'TECHNICAL ASSESSMENT REPORT', candidateName, applicationId); rowY = doc.y; }
          const s = strengths[i] ? `+ ${strengths[i]}` : '';
          const w = weaknesses[i] ? `- ${weaknesses[i]}` : '';
          const sH = s ? doc.heightOfString(s, { fontSize: 8, width: colW - 20 }) + 8 : 0;
          const wH = w ? doc.heightOfString(w, { fontSize: 8, width: colW - 20 }) + 8 : 0;
          const rowH = Math.max(sH, wH, 18);
          doc.rect(MARGIN, rowY, colW, rowH).fill(i % 2 ? C.white : C.light).stroke(C.border);
          doc.rect(MARGIN + colW + 10, rowY, colW, rowH).fill(i % 2 ? C.white : C.light).stroke(C.border);
          if (s) doc.fillColor(C.green).font('Times-Roman').fontSize(8).text(s, MARGIN + 10, rowY + 5, { width: colW - 20 });
          if (w) doc.fillColor(C.red).font('Times-Roman').fontSize(8).text(w, MARGIN + colW + 20, rowY + 5, { width: colW - 20 });
          rowY += rowH;
        }
        doc.y = rowY + 8;
      }

      if (assmAnalysis.detailed_feedback || assmAnalysis.ai_rationale) {
        doc.moveDown(0.6);
        const rat = assmAnalysis.detailed_feedback || assmAnalysis.ai_rationale;
        doc.rect(MARGIN, doc.y, CONTENT, doc.heightOfString(rat, { fontSize: 8, width: CONTENT - 20 }) + 16)
          .fill(C.accentL).stroke(C.border);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(7).text('AI RATIONALE', MARGIN + 10, doc.y + 6);
        doc.fillColor(C.subtext).font('Times-Italic').fontSize(8).text(rat, MARGIN + 10, doc.y + 4, { width: CONTENT - 20 });
        doc.moveDown(2);
      }
    }

    // ════════════════════════════════════════════════════
    //  PAGE 2+ — Q&A BREAKDOWN
    // ════════════════════════════════════════════════════
    if (questions.length > 0) {
      doc.addPage();
      drawHeader(doc, 'CANDIDATE RESPONSE BREAKDOWN', candidateName, applicationId);

      // Sub-header info bar
      doc.rect(MARGIN, doc.y, CONTENT, 22).fill(C.light).stroke(C.border);
      doc.fillColor(C.subtext).font('Times-Roman').fontSize(8)
        .text(`${questions.length} Questions  |  Role: ${jobTitle}  |  Assessment Type: TECHNICAL`,
          MARGIN + 10, doc.y + 7);
      doc.moveDown(2);

      questions.forEach((q, idx) => {
        const ansData = getAnswer(q.questionId);
        const candidateAns = ansData?.answer_text ? String(ansData.answer_text).trim() : null;
        const referenceAns = q.correct_answer || q.expected_answer || null;
        const hasAnswer = !!candidateAns;
        const isCorrect = (referenceAns && hasAnswer)
          ? candidateAns.toLowerCase() === referenceAns.trim().toLowerCase()
          : null;

        const qType = (q.section_type || q.questionType || 'TECHNICAL').toUpperCase();
        const diff = (q.difficulty || 'MEDIUM').toUpperCase();

        // Ensure enough space; add page if tight
        const estimatedH = 80
          + doc.heightOfString(q.question, { fontSize: 9, width: CONTENT - 20 })
          + (hasAnswer ? doc.heightOfString(candidateAns, { fontSize: 8.5, width: CONTENT - 20 }) : 14)
          + (referenceAns ? doc.heightOfString(referenceAns, { fontSize: 8.5, width: CONTENT - 20 }) : 0);

        if (doc.y + estimatedH > 750) {
          doc.addPage();
          drawHeader(doc, 'CANDIDATE RESPONSE BREAKDOWN (CONT.)', candidateName, applicationId);
          doc.moveDown(0.5);
        }

        const qStartY = doc.y;

        // Q number + type row
        doc.rect(MARGIN, qStartY, CONTENT, 20).fill(q.section_type === 'BEHAVIORAL' ? '#f0f9ff' : C.light).stroke(C.border);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(8.5)
          .text(`Q${idx + 1}`, MARGIN + 10, qStartY + 6);
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(`${qType}  |  ${diff}  |  Weight: ${q.weight || 1}`, MARGIN + 35, qStartY + 7);

        // Correct / Incorrect badge (right side)
        if (isCorrect !== null) {
          const badge = isCorrect ? 'CORRECT' : 'INCORRECT';
          const bCol = isCorrect ? C.green : C.red;
          const bColL = isCorrect ? C.greenL : C.redL;
          const bW = doc.widthOfString(badge, { fontSize: 7 }) + 18;
          doc.rect(MARGIN + CONTENT - bW, qStartY + 4, bW, 13).fill(bColL).stroke(bCol);
          doc.fillColor(bCol).font('Times-Bold').fontSize(7)
            .text(badge, MARGIN + CONTENT - bW + 5, qStartY + 7, { width: bW - 10 });
        }

        doc.y = qStartY + 26;

        // Question text
        doc.fillColor(C.text).font('Times-Bold').fontSize(9)
          .text(q.question, MARGIN + 10, doc.y, { width: CONTENT - 20 });
        doc.moveDown(0.7);

        // Candidate answer block
        doc.rect(MARGIN, doc.y, CONTENT, 14).fill(hasAnswer ? C.amberL : C.redL).stroke(C.border);
        doc.fillColor(hasAnswer ? C.amber : C.red).font('Times-Bold').fontSize(7)
          .text('CANDIDATE ANSWER', MARGIN + 10, doc.y + 4, { characterSpacing: 0.5 });
        doc.moveDown(1.1);
        doc.rect(MARGIN, doc.y, CONTENT, 0).stroke();
        if (hasAnswer) {
          doc.fillColor(C.subtext).font('Times-Roman').fontSize(8.5)
            .text(candidateAns, MARGIN + 10, doc.y, { width: CONTENT - 20 });
        } else {
          doc.fillColor(C.muted).font('Times-Italic').fontSize(8.5)
            .text('No response recorded — candidate did not attempt this question.', MARGIN + 10, doc.y, { width: CONTENT - 20 });
        }
        doc.moveDown(0.8);

        // Reference answer block
        if (referenceAns) {
          doc.rect(MARGIN, doc.y, CONTENT, 14).fill(C.greenL).stroke(C.border);
          doc.fillColor(C.green).font('Times-Bold').fontSize(7)
            .text('REFERENCE ANSWER', MARGIN + 10, doc.y + 4, { characterSpacing: 0.5 });
          doc.moveDown(1.1);
          doc.fillColor('#166534').font('Times-Roman').fontSize(8.5)
            .text(referenceAns, MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.8);
        }

        // Keywords line
        if (Array.isArray(q.keywords) && q.keywords.length > 0) {
          doc.fillColor(C.muted).font('Times-Roman').fontSize(7)
            .text(`Keywords: ${q.keywords.join('  |  ')}`, MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.4);
        }

        // Divider
        rule(doc);
      });
    }

    // ════════════════════════════════════════════════════
    //  INTEGRITY PAGE
    // ════════════════════════════════════════════════════
    doc.addPage();
    drawHeader(doc, 'INTEGRITY & PROCTORING REPORT', candidateName, applicationId);

    section(doc, 'Proctoring Summary');
    const iY = doc.y;
    const iW = (CONTENT - 12) / 3;
    // Integrity score card
    scoreCard(doc, MARGIN, iY, iW, 'Integrity Score', integrityPct);
    scoreCard(doc, MARGIN + iW + 6, iY, iW, 'Violations Logged', malpractice.length, 10,
      malpractice.length === 0 ? C.green : C.red);
    // Risk level card
    const riskLabel = integrityPct >= 90 ? 'LOW RISK'
      : integrityPct >= 70 ? 'MODERATE RISK' : 'HIGH RISK';
    const riskCol = integrityPct >= 90 ? C.green : integrityPct >= 70 ? C.amber : C.red;
    const riskColL = integrityPct >= 90 ? C.greenL : integrityPct >= 70 ? C.amberL : C.redL;
    doc.rect(MARGIN + (iW + 6) * 2, iY, iW, 64).fill(riskColL).stroke(riskCol);
    doc.rect(MARGIN + (iW + 6) * 2, iY, iW, 3).fill(riskCol);
    doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('AUTOMATED RISK STATUS', MARGIN + (iW + 6) * 2 + 8, iY + 10, { characterSpacing: 0.5 });
    doc.fillColor(riskCol).font('Times-Bold').fontSize(13).text(riskLabel, MARGIN + (iW + 6) * 2 + 8, iY + 24);

    doc.y = iY + 74;

    section(doc, 'Malpractice Event Log');
    if (malpractice.length === 0) {
      doc.rect(MARGIN, doc.y, CONTENT, 34).fill(C.greenL).stroke(C.border);
      doc.fillColor(C.green).font('Times-Bold').fontSize(10)
        .text('No malpractice events detected  —  Integrity Verified', MARGIN, doc.y + 12, { align: 'center', width: CONTENT });
      doc.moveDown(3.5);
    } else {
      // Table header
      const cols = { num: 30, type: 200, sev: 70, time: 120, det: CONTENT - 420 };
      const hY = doc.y;
      doc.rect(MARGIN, hY, CONTENT, 16).fill(C.accentL).stroke(C.border);
      doc.fillColor(C.accent).font('Times-Bold').fontSize(7)
        .text('#', MARGIN + 6, hY + 5)
        .text('EVENT TYPE', MARGIN + 36, hY + 5)
        .text('SEVERITY', MARGIN + 236, hY + 5)
        .text('TIMESTAMP', MARGIN + 310, hY + 5)
        .text('DETECTOR', MARGIN + 430, hY + 5);
      doc.y = hY + 18;

      malpractice.forEach((evt, i) => {
        if (doc.y > 690) doc.addPage();
        const eY = doc.y;
        const sev = evt.severity || 1;
        const col = sev >= 7 ? C.red : sev >= 4 ? C.amber : C.gray;
        doc.rect(MARGIN, eY, CONTENT, 18).fill(i % 2 ? C.white : C.light).stroke(C.borderL);
        doc.fillColor(C.subtext).font('Times-Roman').fontSize(8).text(`${i + 1}`, MARGIN + 6, eY + 5);
        doc.fillColor(col).font('Times-Bold').fontSize(8)
          .text((evt.type || 'UNKNOWN').replace(/_/g, ' '), MARGIN + 36, eY + 5, { width: 190 });
        doc.fillColor(col).font('Times-Bold').fontSize(8).text(`${sev}/10`, MARGIN + 236, eY + 5);
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(new Date(evt.created_at).toLocaleTimeString(), MARGIN + 310, eY + 6);
        doc.fillColor(C.muted).font('Times-Roman').fontSize(7.5)
          .text(evt.meta?.detector || 'Proctoring Engine', MARGIN + 430, eY + 6, { width: 100 });
        doc.y = eY + 20;
      });
    }

    // ── Audit Trail ────────────────────────────────
    section(doc, 'Application Status Audit Trail');
    if (auditLogs.length === 0) {
      doc.fillColor(C.muted).font('Times-Italic').fontSize(8).text('No audit entries found.', MARGIN + 10, doc.y);
      doc.moveDown(1);
    } else {
      const hY = doc.y;
      doc.rect(MARGIN, hY, CONTENT, 16).fill(C.accentL).stroke(C.border);
      doc.fillColor(C.accent).font('Times-Bold').fontSize(7)
        .text('STATUS CHANGE', MARGIN + 10, hY + 5)
        .text('FROM', MARGIN + 200, hY + 5)
        .text('DATE & TIME', MARGIN + 340, hY + 5)
        .text('NOTE', MARGIN + 440, hY + 5);
      doc.y = hY + 18;

      auditLogs.forEach((log, i) => {
        if (doc.y > 700) doc.addPage();
        const lY = doc.y;
        const h = Math.max(18, log.reason
          ? doc.heightOfString(log.reason, { fontSize: 7, width: 110 }) + 8 : 18);
        doc.rect(MARGIN, lY, CONTENT, h).fill(i % 2 ? C.white : C.light).stroke(C.borderL);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(7.5)
          .text(log.new_status || '-', MARGIN + 10, lY + 5, { width: 185 });
        doc.fillColor(C.muted).font('Times-Roman').fontSize(7.5)
          .text(log.previous_status || 'START', MARGIN + 200, lY + 5, { width: 135 });
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(new Date(log.created_at).toLocaleString(), MARGIN + 340, lY + 5, { width: 95 });
        if (log.reason) {
          doc.fillColor(C.subtext).font('Times-Italic').fontSize(7)
            .text(log.reason, MARGIN + 440, lY + 5, { width: 110 });
        }
        doc.y = lY + h;
      });
    }

    doc.flushPages();
    doc.end();

  } catch (error) {
    console.error('Assessment PDF Error:', error);
    res.status(500).json({ error: 'Failed to generate assessment PDF', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
//  INTERVIEW PDF
// ─────────────────────────────────────────────────────────────────
exports.generateInterviewReport = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const [application, session, analysis, malpractice, auditLogs] = await Promise.all([
      Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, { model: Job }]
      }),
      InterviewSession.findOne({
        where: { application_id: applicationId },
        order: [['created_at', 'DESC']]
      }),
      InterviewAnalysis.findOne({
        where: { application_id: applicationId }
      }),
      MalpracticeEvent.findAll({ where: { application_id: applicationId }, order: [['created_at', 'ASC']] }),
      ApplicationStatusLog.findAll({ where: { application_id: applicationId }, order: [['created_at', 'ASC']] })
    ]);

    if (!application) return res.status(404).json({ error: 'Application not found' });

    const candidateName = application.Candidate?.User?.name || 'N/A';
    const candidateEmail = application.Candidate?.User?.email || 'N/A';
    const jobTitle = application.Job?.title || 'N/A';
    const interviewScore = application.interview_score || analysis?.overall_score || 0;
    const integrityPct = Math.max(0, 100 - (malpractice.length * 10));
    const questions = session?.questions_asked || [];

    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="Interview_Report_${candidateName.replace(/\s+/g, '_')}_App${applicationId}.pdf"`);
    doc.pipe(res);

    // Save Record to DB (async)
    const { DocumentRecord } = require('../models');
    DocumentRecord.findOne({ where: { application_id: applicationId, document_type: 'INTERVIEW_TRANSCRIPT' } })
      .then(existing => {
        if (existing) {
          return existing.update({ generated_at: new Date(), file_size: 1600000 });
        }
        return DocumentRecord.create({
          application_id: applicationId,
          document_type: 'INTERVIEW_TRANSCRIPT',
          file_name: `Interview_Report_${candidateName.replace(/\s+/g, '_')}_App${applicationId}.pdf`,
          file_path: `/reports/interview/${applicationId}.pdf`,
          file_size: 1600000,
          file_type: 'application/pdf',
          generated_at: new Date()
        });
      })
      .catch(err => console.error('Failed to save document record:', err));

    // ════════════════════════════════════════════════════
    //  PAGE 1 — CANDIDATE SUMMARY
    // ════════════════════════════════════════════════════
    drawHeader(doc, 'AI VIDEO INTERVIEW REPORT', candidateName, applicationId);

    // Candidate card
    doc.rect(MARGIN, doc.y, CONTENT, 78).fill(C.white).stroke(C.border);
    const cardY = doc.y + 12;
    doc.fillColor(C.text).font('Times-Bold').fontSize(15)
      .text(candidateName.toUpperCase(), MARGIN + 14, cardY, { width: CONTENT - 150 });
    doc.fillColor(C.gray).font('Times-Roman').fontSize(8.5).text(candidateEmail, MARGIN + 14, cardY + 22);
    doc.fillColor(C.muted).font('Times-Roman').fontSize(8).text(jobTitle, MARGIN + 14, cardY + 36);

    let px = MARGIN + 14;
    const py = cardY + 52;
    px = pill(doc, application.status.replace(/_/g, ' '), px, py, C.accentL, C.accent);
    px = pill(doc, `Interview  ${interviewScore}%`, px, py,
      interviewScore >= 60 ? C.greenL : C.redL, interviewScore >= 60 ? C.green : C.red);
    px = pill(doc, `Integrity  ${integrityPct}%`, px, py,
      integrityPct >= 80 ? C.greenL : C.redL, integrityPct >= 80 ? C.green : C.red);
    if (analysis?.hire_recommendation) {
      pill(doc, `Recommendation: ${analysis.hire_recommendation}`, px, py, C.accentL, C.accent);
    }
    doc.y = doc.y + 90;

    // ── Score Matrix ─────────────────────────────────
    section(doc, 'Multi-Dimensional Score Matrix');
    if (analysis) {
      const matY = doc.y;
      const cw = (CONTENT - 24) / 5;
      scoreCard(doc, MARGIN, matY, cw, 'Overall', analysis.overall_score || 0);
      scoreCard(doc, MARGIN + (cw + 6) * 1, matY, cw, 'Technical', analysis.technical_knowledge_score || 0);
      scoreCard(doc, MARGIN + (cw + 6) * 2, matY, cw, 'Communication', analysis.communication_score || 0);
      scoreCard(doc, MARGIN + (cw + 6) * 3, matY, cw, 'Soft Skills', analysis.soft_skills_score || 0);
      scoreCard(doc, MARGIN + (cw + 6) * 4, matY, cw, 'Cultural Fit', analysis.cultural_fit_score || 0);
      doc.moveDown(5.5);
    }

    // ── AI Analysis ──────────────────────────────────
    if (analysis) {
      section(doc, 'AI Interview Analysis — Strengths & Areas for Improvement');
      const strengths = Array.isArray(analysis.strengths) ? analysis.strengths : [];
      const weaknesses = Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [];
      const maxI = Math.max(strengths.length, weaknesses.length, 0);

      if (maxI > 0) {
        const colW = (CONTENT - 10) / 2;
        const swY = doc.y;
        doc.rect(MARGIN, swY, colW, 20).fill(C.greenL).stroke(C.border);
        doc.fillColor(C.green).font('Times-Bold').fontSize(8)
          .text('STRENGTHS', MARGIN + 10, swY + 6);
        doc.rect(MARGIN + colW + 10, swY, colW, 20).fill(C.redL).stroke(C.border);
        doc.fillColor(C.red).font('Times-Bold').fontSize(8)
          .text('AREAS FOR IMPROVEMENT', MARGIN + colW + 20, swY + 6);

        let rowY = swY + 26;
        for (let i = 0; i < maxI; i++) {
          if (rowY > 680) { doc.addPage(); drawHeader(doc, 'AI VIDEO INTERVIEW REPORT', candidateName, applicationId); rowY = doc.y; }
          const s = strengths[i] ? `+ ${strengths[i]}` : '';
          const w = weaknesses[i] ? `- ${weaknesses[i]}` : '';
          const sH = s ? doc.heightOfString(s, { fontSize: 8, width: colW - 20 }) + 8 : 0;
          const wH = w ? doc.heightOfString(w, { fontSize: 8, width: colW - 20 }) + 8 : 0;
          const rH = Math.max(sH, wH, 18);
          doc.rect(MARGIN, rowY, colW, rH).fill(i % 2 ? C.white : C.light).stroke(C.border);
          doc.rect(MARGIN + colW + 10, rowY, colW, rH).fill(i % 2 ? C.white : C.light).stroke(C.border);
          if (s) doc.fillColor(C.green).font('Times-Roman').fontSize(8).text(s, MARGIN + 10, rowY + 5, { width: colW - 20 });
          if (w) doc.fillColor(C.red).font('Times-Roman').fontSize(8).text(w, MARGIN + colW + 20, rowY + 5, { width: colW - 20 });
          rowY += rH;
        }
        doc.y = rowY + 8;
      }

      // Behavioral flags
      const greenFlags = Array.isArray(analysis.green_flags) ? analysis.green_flags : [];
      const redFlags = Array.isArray(analysis.red_flags) ? analysis.red_flags : [];
      if (greenFlags.length > 0 || redFlags.length > 0) {
        section(doc, 'Behavioral Flag Analysis');
        greenFlags.forEach(f => {
          doc.fillColor(C.green).font('Times-Roman').fontSize(8)
            .text(`  [POSITIVE]  ${f}`, MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.5);
        });
        redFlags.forEach(f => {
          doc.fillColor(C.red).font('Times-Roman').fontSize(8)
            .text(`  [CONCERN]   ${f}`, MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.5);
        });
      }

      if (analysis.detailed_evaluation) {
        doc.moveDown(0.4);
        doc.rect(MARGIN, doc.y, CONTENT,
          doc.heightOfString(analysis.detailed_evaluation, { fontSize: 8, width: CONTENT - 20 }) + 16)
          .fill(C.accentL).stroke(C.border);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(7).text('AI RATIONALE', MARGIN + 10, doc.y + 6);
        doc.fillColor(C.subtext).font('Times-Italic').fontSize(8)
          .text(analysis.detailed_evaluation, MARGIN + 10, doc.y + 4, { width: CONTENT - 20 });
        doc.moveDown(2);
      }
    }

    // ════════════════════════════════════════════════════
    //  PAGE 2+ — Q&A TRANSCRIPT
    // ════════════════════════════════════════════════════
    if (questions.length > 0) {
      doc.addPage();
      drawHeader(doc, 'INTERVIEW TRANSCRIPT & RESPONSE ANALYSIS', candidateName, applicationId);
      doc.rect(MARGIN, doc.y, CONTENT, 22).fill(C.light).stroke(C.border);
      doc.fillColor(C.subtext).font('Times-Roman').fontSize(8)
        .text(`${questions.length} Questions  |  Role: ${jobTitle}  |  AI Video Interview`, MARGIN + 10, doc.y + 7);
      doc.moveDown(2);

      questions.forEach((qa, idx) => {
        const questionText = qa.question_text || qa.question || `Question ${idx + 1}`;
        const responseText = qa.response_text || qa.answer || null;
        const hasResponse = !!(responseText);
        const respTime = qa.response_duration_seconds || 0;
        const wordCount = qa.analysis?.word_count || 0;
        const confScore = qa.analysis?.confidence ? Math.round(qa.analysis.confidence * 100) : null;
        const relScore = qa.analysis?.relevance ? Math.round(qa.analysis.relevance * 100) : null;
        const fillerCount = qa.analysis?.filler_words || 0;

        const estH = 90
          + doc.heightOfString(questionText, { fontSize: 9, width: CONTENT - 20 })
          + (hasResponse ? doc.heightOfString(responseText, { fontSize: 8.5, width: CONTENT - 20 }) : 14);
        if (doc.y + estH > 750) {
          doc.addPage();
          drawHeader(doc, 'INTERVIEW TRANSCRIPT (CONT.)', candidateName, applicationId);
          doc.moveDown(0.5);
        }

        const qStartY = doc.y;
        doc.rect(MARGIN, qStartY, CONTENT, 20).fill(C.light).stroke(C.border);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(8.5).text(`Q${idx + 1}`, MARGIN + 10, qStartY + 6);
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(`${(qa.category || 'INTERVIEW').toUpperCase()}  |  ${respTime}s  |  ${wordCount} words`,
            MARGIN + 35, qStartY + 7);
        doc.y = qStartY + 26;

        doc.fillColor(C.text).font('Times-Bold').fontSize(9)
          .text(questionText, MARGIN + 10, doc.y, { width: CONTENT - 20 });
        doc.moveDown(0.7);

        // Response block
        doc.rect(MARGIN, doc.y, CONTENT, 14).fill(hasResponse ? C.amberL : C.redL).stroke(C.border);
        doc.fillColor(hasResponse ? C.amber : C.red).font('Times-Bold').fontSize(7)
          .text('CANDIDATE RESPONSE', MARGIN + 10, doc.y + 4);
        doc.moveDown(1.1);
        if (hasResponse) {
          doc.fillColor(C.subtext).font('Times-Roman').fontSize(8.5)
            .text(responseText, MARGIN + 10, doc.y, { width: CONTENT - 20 });
        } else {
          doc.fillColor(C.muted).font('Times-Italic').fontSize(8.5)
            .text('No response recorded.', MARGIN + 10, doc.y);
        }
        doc.moveDown(0.8);

        // Reference answer
        if (qa.expectedAnswer) {
          doc.rect(MARGIN, doc.y, CONTENT, 14).fill(C.greenL).stroke(C.border);
          doc.fillColor(C.green).font('Times-Bold').fontSize(7).text('REFERENCE ANSWER', MARGIN + 10, doc.y + 4);
          doc.moveDown(1.1);
          doc.fillColor('#166534').font('Times-Roman').fontSize(8.5)
            .text(qa.expectedAnswer, MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.8);
        }

        // Per-answer metrics bar
        const metrics = [
          confScore !== null ? `Confidence: ${confScore}%` : null,
          relScore !== null ? `Relevance: ${relScore}%` : null,
          `Filler Words: ${fillerCount}`,
        ].filter(Boolean);
        if (metrics.length) {
          doc.fillColor(C.muted).font('Times-Roman').fontSize(7)
            .text(metrics.join('   |   '), MARGIN + 10, doc.y, { width: CONTENT - 20 });
          doc.moveDown(0.5);
        }

        rule(doc);
      });
    }

    // ════════════════════════════════════════════════════
    //  INTEGRITY PAGE
    // ════════════════════════════════════════════════════
    doc.addPage();
    drawHeader(doc, 'INTEGRITY & PROCTORING REPORT', candidateName, applicationId);

    section(doc, 'Proctoring Summary');
    const iY = doc.y;
    const iW = (CONTENT - 12) / 3;
    scoreCard(doc, MARGIN, iY, iW, 'Integrity Score', integrityPct);
    scoreCard(doc, MARGIN + iW + 6, iY, iW, 'Violations Logged', malpractice.length, 10,
      malpractice.length === 0 ? C.green : C.red);
    const riskLabel = integrityPct >= 90 ? 'LOW RISK' : integrityPct >= 70 ? 'MODERATE RISK' : 'HIGH RISK';
    const riskCol = integrityPct >= 90 ? C.green : integrityPct >= 70 ? C.amber : C.red;
    const riskColL = integrityPct >= 90 ? C.greenL : integrityPct >= 70 ? C.amberL : C.redL;
    doc.rect(MARGIN + (iW + 6) * 2, iY, iW, 64).fill(riskColL).stroke(riskCol);
    doc.rect(MARGIN + (iW + 6) * 2, iY, iW, 3).fill(riskCol);
    doc.fillColor(C.muted).font('Times-Roman').fontSize(7).text('AUTOMATED RISK STATUS', MARGIN + (iW + 6) * 2 + 8, iY + 10);
    doc.fillColor(riskCol).font('Times-Bold').fontSize(13).text(riskLabel, MARGIN + (iW + 6) * 2 + 8, iY + 24);
    doc.y = iY + 74;

    section(doc, 'Malpractice Event Log');
    if (malpractice.length === 0) {
      doc.rect(MARGIN, doc.y, CONTENT, 34).fill(C.greenL).stroke(C.border);
      doc.fillColor(C.green).font('Times-Bold').fontSize(10)
        .text('No malpractice events detected  —  Integrity Verified', MARGIN, doc.y + 12, { align: 'center', width: CONTENT });
      doc.moveDown(3.5);
    } else {
      const hY = doc.y;
      doc.rect(MARGIN, hY, CONTENT, 16).fill(C.accentL).stroke(C.border);
      doc.fillColor(C.accent).font('Times-Bold').fontSize(7)
        .text('#', MARGIN + 6, hY + 5).text('EVENT TYPE', MARGIN + 36, hY + 5)
        .text('SEVERITY', MARGIN + 236, hY + 5).text('TIMESTAMP', MARGIN + 310, hY + 5)
        .text('DETECTOR', MARGIN + 430, hY + 5);
      doc.y = hY + 18;
      malpractice.forEach((evt, i) => {
        if (doc.y > 690) doc.addPage();
        const eY = doc.y;
        const sev = evt.severity || 1;
        const col = sev >= 7 ? C.red : sev >= 4 ? C.amber : C.gray;
        doc.rect(MARGIN, eY, CONTENT, 18).fill(i % 2 ? C.white : C.light).stroke(C.borderL);
        doc.fillColor(C.subtext).font('Times-Roman').fontSize(8).text(`${i + 1}`, MARGIN + 6, eY + 5);
        doc.fillColor(col).font('Times-Bold').fontSize(8)
          .text((evt.type || 'UNKNOWN').replace(/_/g, ' '), MARGIN + 36, eY + 5, { width: 190 });
        doc.fillColor(col).font('Times-Bold').fontSize(8).text(`${sev}/10`, MARGIN + 236, eY + 5);
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(new Date(evt.created_at).toLocaleTimeString(), MARGIN + 310, eY + 6);
        doc.fillColor(C.muted).font('Times-Roman').fontSize(7.5)
          .text(evt.meta?.detector || 'Proctoring Engine', MARGIN + 430, eY + 6, { width: 100 });
        doc.y = eY + 20;
      });
    }

    section(doc, 'Application Status Audit Trail');
    if (auditLogs.length === 0) {
      doc.fillColor(C.muted).font('Times-Italic').fontSize(8).text('No audit entries found.', MARGIN + 10, doc.y);
    } else {
      const hY = doc.y;
      doc.rect(MARGIN, hY, CONTENT, 16).fill(C.accentL).stroke(C.border);
      doc.fillColor(C.accent).font('Times-Bold').fontSize(7)
        .text('STATUS CHANGE', MARGIN + 10, hY + 5).text('FROM', MARGIN + 200, hY + 5)
        .text('DATE & TIME', MARGIN + 340, hY + 5).text('NOTE', MARGIN + 440, hY + 5);
      doc.y = hY + 18;
      auditLogs.forEach((log, i) => {
        if (doc.y > 700) doc.addPage();
        const lY = doc.y;
        const h = Math.max(18, log.reason ? doc.heightOfString(log.reason, { fontSize: 7, width: 110 }) + 8 : 18);
        doc.rect(MARGIN, lY, CONTENT, h).fill(i % 2 ? C.white : C.light).stroke(C.borderL);
        doc.fillColor(C.accent).font('Times-Bold').fontSize(7.5)
          .text(log.new_status || '-', MARGIN + 10, lY + 5, { width: 185 });
        doc.fillColor(C.muted).font('Times-Roman').fontSize(7.5)
          .text(log.previous_status || 'START', MARGIN + 200, lY + 5, { width: 135 });
        doc.fillColor(C.gray).font('Times-Roman').fontSize(7.5)
          .text(new Date(log.created_at).toLocaleString(), MARGIN + 340, lY + 5, { width: 95 });
        if (log.reason) {
          doc.fillColor(C.subtext).font('Times-Italic').fontSize(7)
            .text(log.reason, MARGIN + 440, lY + 5, { width: 110 });
        }
        doc.y = lY + h;
      });
    }

    doc.flushPages();
    doc.end();

  } catch (error) {
    console.error('Interview PDF Error:', error);
    res.status(500).json({ error: 'Failed to generate interview PDF', details: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
//  EXECUTIVE REPORT
// ─────────────────────────────────────────────────────────────────
exports.generateExecutiveReport = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const [application, analysis, session] = await Promise.all([
      Application.findByPk(applicationId, {
        include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }, { model: Job }]
      }),
      InterviewAnalysis.findOne({ where: { application_id: applicationId } }),
      InterviewSession.findOne({
        where: { application_id: applicationId },
        order: [['created_at', 'DESC']]
      })
    ]);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const name = application.Candidate?.User?.name || 'N/A';
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Executive_Report_${applicationId}.pdf`);
    doc.pipe(res);

    drawHeader(doc, 'EXECUTIVE EVALUATION SUMMARY', name, applicationId);
    section(doc, 'Decision & AI Rationale');
    infoRow(doc, 'Candidate', name);
    infoRow(doc, 'Applied Role', application.Job?.title || 'N/A');
    infoRow(doc, 'Final Decision', application.final_decision || 'PENDING');
    doc.moveDown(0.5);
    if (application.ai_rationale) {
      doc.rect(MARGIN, doc.y, CONTENT,
        doc.heightOfString(application.ai_rationale, { fontSize: 8.5, width: CONTENT - 20 }) + 16)
        .fill(C.accentL).stroke(C.border);
      doc.fillColor(C.subtext).font('Times-Roman').fontSize(8.5)
        .text(application.ai_rationale, MARGIN + 10, doc.y + 8, { width: CONTENT - 20 });
      doc.moveDown(2.5);
    }

    section(doc, 'Score Matrix');
    const matY = doc.y;
    const cw = (CONTENT - 18) / 4;
    scoreCard(doc, MARGIN, matY, cw, 'Assessment', application.technical_score || 0);
    scoreCard(doc, MARGIN + cw + 6, matY, cw, 'Interview', application.interview_score || 0);
    scoreCard(doc, MARGIN + (cw + 6) * 2, matY, cw, 'Integrity', application.integrity_score || 0);
    scoreCard(doc, MARGIN + (cw + 6) * 3, matY, cw, 'Success Prob',
      Math.round((application.success_probability || 0) * 100));
    doc.moveDown(5.5);

    // ── Phase 5 Interview Highlights ──────────────────
    if (analysis) {
      section(doc, 'Phase 5: AI Interview Intelligence');
      infoRow(doc, 'Hire Recommendation', analysis.hire_recommendation || 'MAYBE');
      infoRow(doc, 'Rating', analysis.rating || 'N/A');

      if (analysis.strengths && analysis.strengths.length > 0) {
        doc.moveDown(0.5);
        doc.fillColor(C.green).font('Times-Bold').fontSize(8).text('KEY STRENGTHS:', MARGIN);
        doc.fillColor(C.subtext).font('Times-Roman').fontSize(8).text(analysis.strengths.join(', '), MARGIN + 100, doc.y - 8, { width: CONTENT - 100 });
      }

      if (analysis.weaknesses && analysis.weaknesses.length > 0) {
        doc.moveDown(0.5);
        doc.fillColor(C.red).font('Times-Bold').fontSize(8).text('AREAS OF CONCERN:', MARGIN);
        doc.fillColor(C.subtext).font('Times-Roman').fontSize(8).text(analysis.weaknesses.join(', '), MARGIN + 100, doc.y - 8, { width: CONTENT - 100 });
      }

      if (analysis.detailed_evaluation) {
        doc.moveDown(1);
        doc.rect(MARGIN, doc.y, CONTENT, 40).fill(C.light).stroke(C.border);
        doc.fillColor(C.muted).font('Times-Italic').fontSize(7.5).text('INTERVIEW SUMMARY:', MARGIN + 8, doc.y + 6);
        doc.fillColor(C.text).font('Times-Roman').fontSize(8).text(analysis.detailed_evaluation.substring(0, 300) + '...', MARGIN + 8, doc.y + 4, { width: CONTENT - 16 });
      }

      // ── Full Q&A Transcript Section ──────────────────
      const qa = analysis.qa_pairs || session?.questions_asked || [];
      if (Array.isArray(qa) && qa.length > 0) {
        doc.addPage();
        drawHeader(doc, 'INTERVIEW Q&A TRANSCRIPT', name, applicationId);
        section(doc, 'Phase 5: Full Interview Interaction');

        qa.forEach((pair, i) => {
          if (doc.y > 650) {
            doc.addPage();
            drawHeader(doc, 'INTERVIEW Q&A TRANSCRIPT', name, applicationId);
          }

          const questionText = pair.question_text || pair.question || `Question ${i + 1}`;
          const answerText = pair.answer_text || pair.response_text || 'No verbal response recorded.';

          doc.fillColor(C.accent).font('Times-Bold').fontSize(8.5).text(`Q${i + 1}: ${questionText}`, MARGIN);
          doc.moveDown(0.2);
          doc.fillColor(C.subtext).font('Times-Roman').fontSize(8.5).text(`A: ${answerText}`, MARGIN + 12, doc.y, { width: CONTENT - 12 });

          if (pair.relevance_score !== undefined) {
            doc.fillColor(C.muted).font('Times-Italic').fontSize(7)
              .text(`AI Relevance Score: ${pair.relevance_score}/10 | Logic Match: ${pair.logic_score || 'N/A'}`, MARGIN + 12, doc.y + 2);
          }

          doc.moveDown(1);
          rule(doc);
        });
      }
    }

    doc.end();
  } catch (err) {
    console.error('Executive Report Error:', err);
    res.status(500).json({ error: 'Failed to generate executive report', details: err.message });
  }
};

/**
 * Get system-wide report statistics
 * GET /hr/reports/stats
 */
exports.getReportStats = async (req, res) => {
  try {
    const totalGenerated = await DocumentRecord.count();
    const last30DaysCount = await DocumentRecord.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    });

    const totalDownloaded = await DocumentRecord.sum('view_count');

    // Type distribution
    const distribution = await DocumentRecord.findAll({
      attributes: ['document_type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['document_type'],
      raw: true
    });

    // Storage calculation (mock for now but based on real count)
    const storageUsed = (totalGenerated * 1.5); // Assume 1.5MB avg
    const storageLimit = 10240; // 10GB limit

    res.json({
      success: true,
      data: {
        kpis: {
          totalGenerated,
          growth: 12.5, // Mock growth for now
          totalDownloaded: totalDownloaded || 0,
          downloadGrowth: 8.4,
          scheduledReports: 0,
          accuracy: 98
        },
        storage: {
          used: parseFloat(storageUsed.toFixed(1)),
          total: storageLimit,
          percent: Math.round((storageUsed / storageLimit) * 100)
        },
        distribution: distribution.map(d => ({
          name: d.document_type,
          count: parseInt(d.count)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get list of all generated reports
 * GET /hr/reports/list
 */
exports.getReportsList = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: records } = await DocumentRecord.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Application,
          include: [
            { model: Job, attributes: ['title'] },
            { model: Candidate, include: [{ model: User, attributes: ['name'] }] }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    const results = records.map(r => ({
      id: r.id,
      name: r.file_name,
      type: r.document_type,
      generatedBy: 'System AI',
      dateTime: r.created_at,
      dateRange: 'N/A',
      format: r.file_type === 'application/pdf' ? 'PDF' : 'XLSX',
      size: `${(r.file_size / (1024 * 1024)).toFixed(1)} MB`,
      application_id: r.application_id,
      candidate: r.Application?.Candidate?.User?.name || 'Unknown'
    }));

    res.json({
      success: true,
      count: results.length,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: results
    });
  } catch (error) {
    console.error('Error listing reports:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Get recently downloaded/viewed reports
 * GET /hr/reports/recent
 */
exports.getRecentDownloads = async (req, res) => {
  try {
    const recent = await DocumentRecord.findAll({
      where: {
        view_count: { [Op.gt]: 0 }
      },
      include: [
        {
          model: Application,
          include: [{ model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] }]
        }
      ],
      order: [['viewed_at', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: recent.map(r => ({
        id: r.id,
        candidate: r.Application?.Candidate?.User?.name || 'Candidate',
        reportName: r.file_name,
        timeAgo: r.viewed_at,
        img: `/images/default-avatar.png`
      }))
    });
  } catch (error) {
    console.error('Error fetching recent downloads:', error);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Track report download/view
 * POST /hr/reports/:reportId/track
 */
exports.trackDownload = async (req, res) => {
  try {
    const { reportId } = req.params;
    const record = await DocumentRecord.findByPk(reportId);
    if (record) {
      record.view_count += 1;
      record.viewed_at = new Date();
      await record.save();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking download:', err);
    res.status(500).json({ success: false });
  }
};
