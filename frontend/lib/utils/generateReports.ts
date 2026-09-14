import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Generates a professional Assessment Report PDF
 */
export const generateAssessmentReport = (data: { 
  candidate: any; 
  job: any; 
  attempt: any;
  proctoring: any;
}) => {
  const { candidate = {}, job = {}, attempt = {}, proctoring = {} } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Set font to Times New Roman if available, otherwise fallback to Times
  doc.setFont("times", "normal");

  // Header Branding
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 35, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("times", "bold");
  doc.text("TECHNICAL ASSESSMENT REPORT", 20, 22);
  
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.text(`CONFIDENTIAL DOCUMENT | ID: #${attempt.id || "N/A"}`, pageWidth - 20, 22, { align: "right" });

  // Summary Grid
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("times", "bold");
  doc.text("CANDIDATE & ROLE SUMMARY", 20, 50);
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 53, pageWidth - 20, 53);

  autoTable(doc, {
    startY: 60,
    head: [["Attribute", "Information"]],
    body: [
      ["Candidate Name", candidate.name || candidate.User?.name || "N/A"],
      ["Job Position", job.title || "N/A"],
      ["Assessment Type", attempt.assessment_type || "TECHNICAL"],
      ["Submission Date", (attempt.submitted_at || attempt.updated_at || attempt.created_at) ? new Date(attempt.submitted_at || attempt.updated_at || attempt.created_at).toLocaleString() : "N/A"],
      ["Final Score", `${Math.round(attempt.final_score || 0)} / 100`],
    ],
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 10, cellPadding: 4 },
  });

  // AI Performance Metrics
  doc.setFontSize(14);
  doc.text("AI PERFORMANCE METRICS", 20, (doc as any).lastAutoTable.finalY + 15);
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Metric", "Score (%)", "Evaluation Insight"]],
    body: [
      ["Structure Score", `${Math.round(attempt.structure_score || 0)}%`, "Evaluates technical response logical flow."],
      ["Concept Coverage", `${Math.round(attempt.concept_coverage || 0)}%`, "Breadth of topics addressed by candidate."],
      ["ML Semantic Match", `${Math.round(attempt.ml_score || 0)}%`, "Cosine similarity against gold standard."],
    ],
    theme: "grid",
    headStyles: { fillColor: [71, 85, 105], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 10 },
  });

  // Proctoring & Integrity
  doc.setFontSize(14);
  doc.text("PROCTORING & INTEGRITY AUDIT", 20, (doc as any).lastAutoTable.finalY + 15);
  
  const violations = Array.isArray(proctoring) ? proctoring : (proctoring.violations || []);
  const proctoringBody = violations.length > 0 
    ? violations.map((v: any) => [v.type?.replace(/_/g, ' ') || 'Unknown Violation', `${v.severity || v.penalty || 0} pts`, v.created_at ? new Date(v.created_at).toLocaleTimeString() : (v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : "-")])
    : [["No violations detected", "0 pts", "-"]];

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Violation Type", "Severity Penalty", "Timestamp"]],
    body: proctoringBody,
    theme: "plain",
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 10 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  // Detailed Trace (Questions & Answers)
  doc.addPage();
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("DETAILED ASSESSMENT TRACE (Q&A AUDIT)", 20, 10);

  const answers = attempt.answers || {};
  const qaBody = Object.keys(answers).map((qId, idx) => {
    const a = answers[qId];
    return [
      idx + 1,
      a.question_text || qId,
      a.answer_text || "Skipped",
      a.correct_answer || "N/A"
    ];
  });

  autoTable(doc, {
    startY: 25,
    head: [["#", "Question & Correct Answer", "Candidate Response"]],
    body: Object.keys(answers).map((qId, idx) => {
      const a = answers[qId];
      const qText = a.question_text || qId;
      const qCorr = a.correct_answer || "N/A";
      const qAns = a.answer_text || "No Response";
      return [
        idx + 1,
        { content: `${qText}\n\n[EXPECTED]: ${qCorr}`, styles: { fontStyle: 'normal' } },
        qAns
      ];
    }),
    theme: "grid",
    headStyles: { fillColor: [71, 85, 105], font: "times", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 110 },
      2: { cellWidth: 60 }
    },
    styles: { font: "times", fontSize: 9, overflow: 'linebreak', cellPadding: 4 }
  });

  // Proctoring & Malpractice Audit
  doc.addPage();
  doc.setFillColor(153, 27, 27); // Dark Red
  doc.rect(0, 0, pageWidth, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("PROCTORING & INTEGRITY AUDIT LOG", 20, 10);

  const proctoringLogs = attempt.anti_cheating_data || [];
  const proctoringRows = proctoringLogs.length > 0 
    ? proctoringLogs.map((log: any) => [
        log.type?.replace(/_/g, ' ') || "Integrity Event",
        log.penalty || 0,
        log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "N/A",
        "Recorded"
      ])
    : [["No integrity violations detected during session", "0", "-", "-"]];

  autoTable(doc, {
    startY: 25,
    head: [["Integrity Event Type", "Score Penalty", "Timestamp", "Status"]],
    body: proctoringRows,
    theme: "striped",
    headStyles: { fillColor: [153, 27, 27], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 9 }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Pipeline Neural Core | Professional Assessment Audit | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  doc.save(`${candidate.name?.replace(/\s+/g, "_")}_Assessment_Report.pdf`);
};

/**
 * Generates a professional Interview Report PDF
 */
export const generateInterviewReport = (data: { 
  candidate: any; 
  job: any; 
  analysis: any; 
  session: any;
}) => {
  const { candidate = {}, job = {}, analysis = {}, session = {} } = data;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("times", "normal");

  // Header Branding
  doc.setFillColor(29, 78, 216); // Blue-700
  doc.rect(0, 0, pageWidth, 35, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("times", "bold");
  doc.text("AI INTERVIEW AUDIT REPORT", 20, 22);
  
  doc.setFontSize(9);
  doc.setFont("times", "normal");
  doc.text(`CONFIDENTIAL | SYSTEM-GENERATED EVALUATION`, pageWidth - 20, 22, { align: "right" });

  // Summary
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("times", "bold");
  doc.text("CANDIDATE INTERVIEW PROFILE", 20, 50);
  doc.line(20, 53, pageWidth - 20, 53);

  autoTable(doc, {
    startY: 60,
    head: [["Category", "Details"]],
    body: [
      ["Candidate Name", candidate.name || "N/A"],
      ["Job Role", job.title || "N/A"],
      ["Recommendation", (analysis.hire_recommendation || "PENDING").toUpperCase()],
      ["Overall Score", `${Math.round(analysis.overall_score || 0)} / 100`],
    ],
    theme: "striped",
    headStyles: { fillColor: [29, 78, 216], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 10 },
  });

  // Soft Skills Breakdown
  doc.setFontSize(14);
  doc.text("BEHAVIORAL & SOFT SKILLS EVALUATION", 20, (doc as any).lastAutoTable.finalY + 15);
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Skillset", "Score"]],
    body: [
      ["Communication", `${analysis.communication_score || 0}%`],
      ["Problem Solving", `${analysis.problem_solving_score || 0}%`],
      ["Soft Skills", `${analysis.soft_skills_score || 0}%`],
      ["Cultural Fit", `${analysis.cultural_fit_score || 0}%`],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], font: "times", fontStyle: "bold" },
    styles: { font: "times", fontSize: 10 },
  });

  // Detailed Q&A
  if (analysis.qa_pairs || session?.answers_provided) {
    doc.addPage();
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, pageWidth, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text("INTERVIEW TRANSCRIPT & SEMANTIC AUDIT", 20, 10);

    const qaSource = analysis.qa_pairs || session.answers_provided || [];
    const qaBody = qaSource.map((qa: any, idx: number) => [
      idx + 1,
      { 
        content: `${qa.question || qa.question_text || `Question ${idx + 1}`}\n\n[EXPECTED]: ${qa.expected_answer || qa.expectedAnswer || "N/A"}`,
        styles: { fontStyle: 'normal' } 
      },
      qa.answer || qa.candidate_response || "No response recorded"
    ]);

    autoTable(doc, {
      startY: 25,
      head: [["#", "Interview Question & Gold Standard", "Candidate Semantic Response"]],
      body: qaBody,
      theme: "grid",
      headStyles: { fillColor: [29, 78, 216], font: "times", fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 110 },
        2: { cellWidth: 60 }
      },
      styles: { font: "times", fontSize: 9, overflow: 'linebreak', cellPadding: 4 },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`AI Interview Neural Audit | Confidential | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  doc.save(`${candidate.name?.replace(/\s+/g, "_")}_Interview_Report.pdf`);
};
