const { Candidate, Application, ResumeAnalysis, Job } = require("../models");
const aiService = require("../services/ai.service");
const logger = require("../utils/logger");

exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No resume file uploaded",
      });
    }

    const fs = require('fs');
    const { PDFParse } = require('pdf-parse');

    const resumeUrl = `/uploads/resumes/${req.file.filename}`;

    let parsedData = { 
      skills: [], 
      cgpa: null, 
      year_of_passout: null, 
      education: null, 
      specialization: null,
      experience: 0,
      role: null,
      score: 0,
      strengths: [],
      weaknesses: [],
      pros: [],
      cons: [],
      recommendation: null,
      summary: null
    };

    try {
      const dataBuffer = await fs.promises.readFile(req.file.path);
      let text = "";
      if (req.file.path.toLowerCase().endsWith('.pdf')) {
        const pdfInstance = new PDFParse({ data: dataBuffer });
        const textResult = await pdfInstance.getText();
        text = textResult.text;
      } else {
        text = dataBuffer.toString('utf-8');
      }

      // ---------------- CGPA ----------------
      const cgpaMatch = text.match(/CGPA[\s:]*([0-9.]+)/i);
      if (cgpaMatch) parsedData.cgpa = parseFloat(cgpaMatch[1]);

      // ---------------- YEAR ----------------
      const yearMatch = text.match(/(?:201|202)[0-9]/);
      if (yearMatch) parsedData.year_of_passout = parseInt(yearMatch[0], 10);

      // ---------------- EDUCATION ----------------
      const eduList = ["B.Tech", "B.E", "M.Tech", "MCA", "BCA", "B.Sc", "M.Sc", "MBA", "PhD"];
      const foundEdu = eduList.find(e => new RegExp(`\\b${e}\\b`, 'i').test(text));
      if (foundEdu) parsedData.education = foundEdu;

      // ---------------- SPECIALIZATION ----------------
      const specList = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil", "Data Science", "Artificial Intelligence"];
      const foundSpec = specList.find(s => new RegExp(`\\b${s}\\b`, 'i').test(text));
      if (foundSpec) parsedData.specialization = foundSpec;

      // ---------------- ROLE DETECTION ----------------
      const detectRole = (text) => {
        text = text.toLowerCase();

        if (text.includes("rubber") || text.includes("polymer"))
          return "rubber_process_engineer";

        if (text.includes("assistant manager") && text.includes("marketing"))
          return "assistant_manager_marketing";

        if (text.includes("executive") && text.includes("marketing"))
          return "executive_marketing";

        return "management_trainee_marketing";
      };

      const roleSkillMap = {
        rubber_process_engineer: [
          "Rubber Processing", "Polymer", "Extrusion", "Injection Molding",
          "Vulcanization", "Compounding", "Mixing", "Quality Control",
          "Six Sigma", "Process Optimization", "Manufacturing",
          "Thermodynamics", "Material Science"
        ],

        assistant_manager_marketing: [
          "Marketing Strategy", "Brand Management", "Market Research",
          "Digital Marketing", "SEO", "SEM", "Campaign Management",
          "Sales Planning", "CRM", "Team Leadership", "Analytics"
        ],

        executive_marketing: [
          "Lead Generation", "Client Handling", "Sales", "Cold Calling",
          "Digital Marketing", "Social Media", "Email Marketing",
          "Negotiation", "Customer Relationship", "Presentation"
        ],

        management_trainee_marketing: [
          "Marketing Basics", "Communication", "MS Excel", "PowerPoint",
          "Market Research", "Business Development", "Sales Support",
          "Adaptability", "Learning Attitude"
        ]
      };

      const detectedRole = detectRole(text);
      parsedData.role = detectedRole;

      // ---------------- SKILL EXTRACTION ----------------
      const roleSkills = roleSkillMap[detectedRole];
      parsedData.skills = roleSkills.filter(skill =>
        new RegExp(`\\b${skill}\\b`, "i").test(text)
      );

      // ---------------- EXPERIENCE ----------------
      const expMatch = text.match(/(\d+)\+?\s*(years?|yrs?)/i);
      if (expMatch) {
        parsedData.experience = parseInt(expMatch[1]);
      } else if (/fresher/i.test(text)) {
        parsedData.experience = 0;
      }

      // ---------------- SCORE ----------------
      const calculateRoleScore = (skills, roleSkills, experience) => {
        const skillScore = (skills.length / roleSkills.length) * 100;

        let expScore = 50;
        if (experience >= 3) expScore = 100;
        else if (experience >= 1) expScore = 70;
        else expScore = 40;

        return Math.round((skillScore * 0.7) + (expScore * 0.3));
      };

      parsedData.score = calculateRoleScore(
        parsedData.skills,
        roleSkills,
        parsedData.experience || 0
      );

      // ---------------- STRENGTHS & WEAKNESSES ----------------
      if (parsedData.skills.length > roleSkills.length * 0.6) {
        parsedData.strengths.push("Strong domain skill alignment");
      } else {
        parsedData.weaknesses.push("Lacks required key skills");
      }

      if ((parsedData.experience || 0) < 1) {
        parsedData.weaknesses.push("Low experience");
      } else {
        parsedData.strengths.push("Relevant experience");
      }

      // ---------------- PROS & CONS ----------------
      if (parsedData.skills.length > roleSkills.length * 0.6) {
        parsedData.pros.push("Strong alignment with required job skills");
      } else {
        parsedData.cons.push("Missing several key skills required for this role");
      }

      if ((parsedData.experience || 0) >= 3) {
        parsedData.pros.push("Has solid industry experience");
      } else if ((parsedData.experience || 0) >= 1) {
        parsedData.pros.push("Has some relevant experience");
      } else {
        parsedData.cons.push("Very limited or no experience");
      }

      if (parsedData.cgpa && parsedData.cgpa >= 8) {
        parsedData.pros.push("Strong academic performance");
      } else if (parsedData.cgpa && parsedData.cgpa < 6) {
        parsedData.cons.push("Low academic performance");
      }

      if (parsedData.role.includes("marketing")) {
        if (parsedData.skills.includes("Digital Marketing")) {
          parsedData.pros.push("Good exposure to digital marketing");
        } else {
          parsedData.cons.push("Lacks digital marketing exposure");
        }
      }

      // ---------------- RECOMMENDATION ----------------
      parsedData.recommendation =
        parsedData.score > 75
          ? "Highly Recommended"
          : parsedData.score > 50
          ? "Consider"
          : "Not Recommended";

      // ---------------- SUMMARY ----------------
      parsedData.summary =
        parsedData.score > 75
          ? "Candidate is a strong fit for the role"
          : parsedData.score > 50
          ? "Candidate is an average fit and may need training"
          : "Candidate is not a good fit for this role";

    } catch (e) {
      console.error("PDF Parsing failed:", e);
    }

    // ---------------- UPDATE DB ----------------
    const { applicationId } = req.body;
    let candidate = null;
    let application = null;

    if (applicationId) {
      application = await Application.findByPk(applicationId, {
        include: [{ model: Candidate }, { model: Job }]
      });
      if (application) {
        candidate = application.Candidate;
        if (req.user.role === 'CANDIDATE' && candidate.user_id !== req.user.id) {
          return res.status(403).json({ error: "Unauthorized access to application." });
        }
      }
    }

    // Fallback for direct candidate profile uploads
    if (!candidate && req.user.role === "CANDIDATE") {
      candidate = await Candidate.findOne({
        where: { user_id: req.user.id },
      });
      if (candidate && !application) {
        application = await Application.findOne({
          where: { candidate_id: candidate.id },
          order: [['created_at', 'DESC']],
          include: { model: Job }
        });
      }
    }

    if (candidate) {
      await candidate.update({
        resume_path: resumeUrl,
        skills: parsedData.skills,
        cgpa: parsedData.cgpa,
        year_of_passout: parsedData.year_of_passout,
        education: parsedData.education || candidate.education,
        specialization: parsedData.specialization || candidate.specialization,
      });
    }

    // ========== AI PARSING & SCORING (NEW) ==========
    // ========== AI PARSING & SCORING (NEW) ==========
    // ========== AI PARSING & SCORING (ALL APPLICATIONS) ==========
    let aiAnalysisSummary = null;

    try {
      logger.info(`[Resume AI] Starting AI parsing for resume: ${req.file.filename}`);
      const aiParsedData = await aiService.parseResumeWithAI(req.file.path);
      aiAnalysisSummary = aiParsedData;

      // Find all applications for this candidate to update their individual analyses
      const applications = await Application.findAll({
        where: { candidate_id: candidate.id },
        include: [{ model: Job }]
      });

      logger.info(`[Resume AI] Updating ${applications.length} applications for candidate ${candidate.id}`);

      for (const app of applications) {
        let jdScores = { overall_fit_percentage: 0, matched_skills: [], missing_skills: [] };

        if (app.Job) {
          try {
            const jobRequirements = {
              title: app.Job.title,
              description: app.Job.description,
              required_skills: app.Job.required_skills || [],
              min_experience: app.Job.min_experience || 0
            };
            jdScores = await aiService.scoreResume(aiParsedData, jobRequirements);
          } catch (scoreError) {
            logger.warn(`[Resume AI] JD scoring failed for app ${app.id}: ${scoreError.message}`);
          }

          // Manual scoring fallback removed since manualScorer was deleted
        }

        const aiAnalysis = {
          contact_info: aiParsedData.contact_info || {},
          education: aiParsedData.education || [],
          experience: aiParsedData.experience || [],
          total_years_experience: aiParsedData.experience_years || 0, 
          skills: aiParsedData.skills || {},
          certifications: aiParsedData.certifications || [],
          ai_summary: aiParsedData.summary || 'No summary available',
          strengths: Array.from(new Set(aiParsedData.strengths || [])),
          weaknesses: Array.from(new Set(aiParsedData.weaknesses || [])),
          recommendations: aiParsedData.recommendations || [],
          overall_score: aiParsedData.overall_score || parsedData.score,
          jd_match_score: jdScores.overall_fit_percentage || 0,
          jd_matched_skills: jdScores.matched_skills || [],
          jd_missing_skills: jdScores.missing_skills || [],
          role_fit: aiParsedData.role_fit || {},
          red_flags: aiParsedData.red_flags || [],
          green_flags: aiParsedData.green_flags || []
        };


        // Upsert analysis record
        const [analysisRecord, created] = await ResumeAnalysis.findOrCreate({
          where: { application_id: app.id },
          defaults: { ...aiAnalysis, resume_id: 0 }
        });

        if (!created) {
          await analysisRecord.update(aiAnalysis);
        }

        // Update application kpis
        await app.update({
          resume_score: Math.round(jdScores.overall_fit_percentage || aiParsedData.overall_score || 0),
          skills: jdScores.matched_skills || [],
          experience_years: aiParsedData.experience_years || 0
        });

        if (candidate) {
          // Extract first education object if available
          const firstEdu = aiParsedData.education && aiParsedData.education.length > 0 ? aiParsedData.education[0] : null;
          
          const safeInt = (val, fallback) => {
            const parsed = parseInt(val);
            return isNaN(parsed) ? fallback : parsed;
          };

          const resolvedCandidateType = aiParsedData.candidate_type || (safeInt(aiParsedData.experience_years, 0) === 0 ? 'FRESHER' : 'WORKING_PROFESSIONAL');
          const cgpaFromAI = firstEdu?.cgpa ? parseFloat(firstEdu.cgpa) : null;

          await candidate.update({
            experience_years: aiParsedData.experience_years !== undefined ? safeInt(aiParsedData.experience_years, candidate.experience_years) : candidate.experience_years,
            skills: aiParsedData.skills ? (Array.isArray(aiParsedData.skills) ? aiParsedData.skills : Object.values(aiParsedData.skills).flat()) : candidate.skills,
            education: aiParsedData.highest_qualification || firstEdu?.degree || candidate.education,
            specialization: firstEdu?.specialization || candidate.specialization,
            year_of_passout: firstEdu?.year_of_passout ? safeInt(firstEdu.year_of_passout, candidate.year_of_passout) : candidate.year_of_passout,
            phone: aiParsedData.contact_info?.phone || candidate.phone,
            summary: aiParsedData.summary || candidate.summary,
            candidate_type: resolvedCandidateType || candidate.candidate_type,
            // New autofill fields
            location: aiParsedData.location || candidate.location,
            cgpa: cgpaFromAI || candidate.cgpa,
            domain: aiParsedData.domain || candidate.domain,
            area_of_interest: resolvedCandidateType === 'FRESHER' ? (aiParsedData.area_of_interest || candidate.area_of_interest) : candidate.area_of_interest,
            current_company: resolvedCandidateType === 'WORKING_PROFESSIONAL' ? (aiParsedData.current_company || candidate.current_company) : null,
            working_address: resolvedCandidateType === 'WORKING_PROFESSIONAL' ? (aiParsedData.working_address || candidate.working_address) : null,
            internships: aiParsedData.experience_timeline || candidate.internships,
          });
        }

        logger.info(`[Resume AI] Application ${app.id} updated. Score: ${app.resume_score}`);
        await checkAndTriggerAutoRejection(app.id, logger);
      }

    } catch (aiError) {
      logger.error(`[Resume AI] AI processing failed: ${aiError.message}`);
    }

    // Reload candidate to get the latest saved state
    if (candidate) await candidate.reload();

    return res.status(200).json({
      success: true,
      data: {
        parsedData,
        resumeUrl,
        aiAnalysisSummary: aiAnalysisSummary ? {
          score: aiAnalysisSummary.overall_score,
          summary: aiAnalysisSummary.summary
        } : null,
        autofillData: candidate ? {
          education: candidate.education,
          specialization: candidate.specialization,
          experience_years: candidate.experience_years,
          phone: candidate.phone,
          location: candidate.location,
          skills: candidate.skills,
          cgpa: candidate.cgpa,
          year_of_passout: candidate.year_of_passout,
          summary: candidate.summary,
          candidate_type: candidate.candidate_type,
          domain: candidate.domain,
          area_of_interest: candidate.area_of_interest,
          current_company: candidate.current_company,
          working_address: candidate.working_address,
          internships: candidate.internships,
        } : null
      },
    });


  } catch (error) {
    logger.error(`[Resume] Upload error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    });
  }
};

/**
 * Re-parse an existing resume for an application
 * POST /api/resume/reparse/:applicationId
 */
exports.reparseResume = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { Application, Candidate, Job, ResumeAnalysis } = require('../models');

    const application = await Application.findByPk(applicationId, {
      include: [{ model: Candidate }, { model: Job }]
    });

    if (!application || !application.Candidate) {
      return res.status(404).json({ success: false, message: 'Application or Candidate not found' });
    }

    const candidate = application.Candidate;
    const resumePath = candidate.resume_path;

    if (!resumePath) {
      return res.status(400).json({ success: false, message: 'No resume found for this candidate' });
    }

    const path = require('path');
    const fs = require('fs');
    const cleanResumePath = resumePath.startsWith('/') ? resumePath.substring(1) : resumePath;
    const absolutePath = path.resolve(process.cwd(), cleanResumePath);

    if (!require('fs').existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: `Resume file not found: ${resumePath}` });
    }

    logger.info(`[Reparse] Triggering re-parse for application ${applicationId}`);

    const aiParsedData = await aiService.parseResumeWithAI(absolutePath);
    
    let jdScores = { score: 0, matched_skills: [], missing_skills: [] };
    if (application.Job) {
      const jobRequirements = {
        title: application.Job.title,
        description: application.Job.description,
        required_skills: application.Job.required_skills || [],
        min_experience: application.Job.min_experience || 0
      };
      jdScores = await aiService.scoreResume(aiParsedData, jobRequirements);

      // ========== MANUAL SCORING SERVICE FALLBACK REMOVED ==========
    }

    // Update or Create AI Analysis
    let resumeAnalysisRecord = await ResumeAnalysis.findOne({ where: { application_id: applicationId } });
    
    const aiAnalysis = {
      contact_info: aiParsedData.contact_info || {},
      education: aiParsedData.education || [],
      experience: aiParsedData.experience || [],
      total_years_experience: aiParsedData.experience_years || 0,
      skills: aiParsedData.skills || {},
      certifications: aiParsedData.certifications || [],
      ai_summary: aiParsedData.summary || 'No summary available',
      strengths: aiParsedData.strengths || [],
      weaknesses: aiParsedData.weaknesses || [],
      recommendations: aiParsedData.recommendations || [],
      overall_score: aiParsedData.overall_score || 0,
      jd_match_score: jdScores.overall_fit_percentage || 0,
      jd_matched_skills: jdScores.matched_skills || [],
      jd_missing_skills: jdScores.missing_skills || [],
      role_fit: aiParsedData.role_fit || {},
      red_flags: aiParsedData.red_flags || [],
      green_flags: aiParsedData.green_flags || []
    };

    if (resumeAnalysisRecord) {
      await resumeAnalysisRecord.update(aiAnalysis);
    } else {
      await ResumeAnalysis.create({
        application_id: applicationId,
        resume_id: 0,
        ...aiAnalysis
      });
    }

    const resumeScore = Math.round(aiAnalysis.jd_match_score || aiAnalysis.overall_score);
    await application.update({
      resume_score: resumeScore,
      skills: aiAnalysis.jd_matched_skills || candidate.skills,
      experience_years: aiAnalysis.total_years_experience
    });

    const firstEdu = aiParsedData.education && aiParsedData.education.length > 0 ? aiParsedData.education[0] : null;

    const safeInt = (val, fallback) => {
      const parsed = parseInt(val);
      return isNaN(parsed) ? fallback : parsed;
    };

    await candidate.update({
        experience_years: aiAnalysis.total_years_experience !== undefined ? safeInt(aiAnalysis.total_years_experience, candidate.experience_years) : candidate.experience_years,
        skills: aiParsedData.skills ? (Array.isArray(aiParsedData.skills) ? aiParsedData.skills : Object.values(aiParsedData.skills).flat()) : candidate.skills,
        education: aiParsedData.highest_qualification || firstEdu?.degree || candidate.education,
        specialization: firstEdu?.specialization || candidate.specialization,
        year_of_passout: firstEdu?.year_of_passout ? safeInt(firstEdu.year_of_passout, candidate.year_of_passout) : candidate.year_of_passout,
        phone: aiParsedData.contact_info?.phone || candidate.phone,
        summary: aiParsedData.summary || candidate.summary,
        candidate_type: aiParsedData.candidate_type || (aiAnalysis.total_years_experience === 0 ? 'FRESHER' : 'WORKING_PROFESSIONAL') || candidate.candidate_type
    });

    logger.info(`[Reparse] Completed successfully for app ${applicationId}. Score: ${resumeScore}`);

    return res.status(200).json({
      success: true,
      data: {
        score: resumeScore,
        analysis: aiAnalysis
      }
    });

  } catch (error) {
    logger.error(`[Reparse] Critical failure: ${error.message}`);
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message });
  }
};

/**
 * Check if all assessment scores are available and trigger auto-rejection if needed
 */
const checkAndTriggerAutoRejection = async (applicationId, logger) => {
  try {
    const { Application } = require("../models");
    const application = await Application.findByPk(applicationId);

    if (!application) return;

    const { resume_score, technical_score, interview_score } = application;

    // Only trigger if all three scores are available
    if (resume_score !== null && technical_score !== null && interview_score !== null) {
      logger.info(`[Auto-Rejection] All scores available - triggering decision engine for app ${applicationId}`);

      // Calculate final score
      const finalScore = Math.round(
        (resume_score * 0.3) + (technical_score * 0.4) + (interview_score * 0.3)
      );

      // Trigger review if below threshold (previously auto-rejection)
      if (finalScore < 40) {
        logger.info(`[Review] Score ${finalScore} < 40 - Moving to HR_REVIEW for application ${applicationId}`);
        await application.update({
          status: 'HR_REVIEW',
          overall_score: finalScore
        });
      } else if (finalScore >= 60) {
        logger.info(`[Auto-Rejection] Score ${finalScore} >= 60 - RECOMMENDING application ${applicationId}`);
        await application.update({
          status: 'RECOMMENDED_BY_AI',
          overall_score: finalScore
        });
      } else {
        logger.info(`[Auto-Rejection] Score ${finalScore} in range - PROCEED_TO_HR for application ${applicationId}`);
        await application.update({
          overall_score: finalScore
        });
      }
    }
  } catch (error) {
    logger.error(`[Auto-Rejection] Check failed: ${error.message}`);
  }
};