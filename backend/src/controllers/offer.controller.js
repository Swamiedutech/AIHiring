const { Offer, Application, Notification, Job, Candidate, User } = require("../models");
const { sendOfferLetterEmail } = require("../services/email.service");

/* =============================
   HR CREATES OFFER
============================= */
exports.createOffer = async (req, res) => {
  try {
    const { application_id, salary, joining_date, position_title, offer_letter_content, expires_at, benefits } = req.body;

    const application = await Application.findByPk(application_id, {
      include: [{ model: Candidate, include: [User] }, Job]
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    let finalContent = offer_letter_content;
    let finalPositionTitle = position_title || application.Job?.title || "Position";
    if (!finalContent) {
      const { OfferTemplate } = require("../models");
      let templateStr = `<div style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: black; max-width: 800px; margin: 0 auto; padding: 40px; background: white; text-align: justify;">
<p style="text-align: center; margin-bottom: 30px;"><span style="font-size: 14pt; font-weight: bold; text-decoration: underline;">STANDARD JOB OFFER LETTER</span></p>

<p style="margin-bottom: 15px;">Dear <strong>{{candidateName}}</strong>,</p>

<p style="margin-bottom: 15px;"><strong>AI Hiring System</strong> is excited to bring you on board as <strong>{{jobTitle}}</strong>.</p>

<p style="margin-bottom: 15px;">We're just a few formalities away from getting down to work. Please take the time to review our formal offer. It includes important details about your compensation, benefits, and the terms and conditions of your anticipated employment with <strong>AI Hiring System</strong>.</p>

<p style="margin-bottom: 15px;"><strong>AI Hiring System</strong> is offering a <strong>full-time</strong> position for you as <strong>{{jobTitle}}</strong>, reporting to <strong>the Hiring Manager</strong> starting on <strong>{{startDate}}</strong> at <strong>Pune, Maharashtra</strong>. Expected hours of work are <strong>Monday to Friday, 9:00 AM to 6:00 PM</strong>.</p>

<p style="margin-bottom: 15px;">In this position, <strong>AI Hiring System</strong> is offering to start you at a pay rate of <strong>{{salary}}</strong> per <strong>annum</strong>. You will be paid on a <strong>monthly</strong> basis, starting <strong>from your first month of employment</strong>.</p>

<p style="margin-bottom: 15px;">As part of your compensation, we're also offering <strong>performance-based bonuses and a comprehensive benefits package</strong>.</p>

<p style="margin-bottom: 15px;">As an employee of <strong>AI Hiring System</strong> you will be eligible for <strong>standard company benefits, including health insurance, PF, and paid time off</strong>.</p>

<p style="margin-bottom: 15px;">Please indicate your agreement with these terms and accept this offer by signing and dating this agreement on or before <strong>{{deadline}}</strong>.</p>

<p style="margin-bottom: 15px;">Sincerely,</p>

<p><strong>{{hrName}}</strong></p>
</div>`;
      if (OfferTemplate) {
        const t = await OfferTemplate.findOne({ order: [["createdAt", "DESC"]] });
        if (t && t.templateContent) {
           try {
              const parsed = JSON.parse(t.templateContent);
              if (parsed.body) templateStr = parsed.body;
           } catch(e){}
        }
      }
      
      const cName = application.Candidate?.User?.name || "Candidate";
      const sDate = joining_date ? new Date(joining_date).toLocaleDateString() : "TBD";
      const dLine = expires_at ? new Date(expires_at).toLocaleDateString() : new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString();
      const hrName = req.user?.name || "HR Manager";

      finalContent = templateStr
         .replace(/{{candidateName}}/g, cName)
         .replace(/{{jobTitle}}/g, finalPositionTitle)
         .replace(/{{salary}}/g, salary || "TBD")
         .replace(/{{startDate}}/g, sDate)
         .replace(/{{deadline}}/g, dLine)
         .replace(/{{hrName}}/g, hrName)
         .replace(/{{HR Name}}/g, hrName)
         .replace(/\n/g, '<br/>');
    }

    const offer = await Offer.create({
      application_id,
      salary,
      joining_date,
      position_title: finalPositionTitle,
      offer_letter_content: finalContent,
      expires_at,
      benefits,
      status: "PENDING"
    });

    application.status = "OFFERED";
    await application.save();

    // Send Real-time Email
    if (application.Candidate?.User?.email) {
      await sendOfferLetterEmail(
        application.Candidate.User.email,
        application.Candidate.User.name,
        position_title || application.Job?.title || "Position",
        salary,
        joining_date
      );
    }

    await Notification.create({
      role: "CANDIDATE",
      message: "You have received a job offer 🎉"
    });

    res.json({ message: "Offer created and email sent", offer });


  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   CANDIDATE RESPONDS TO OFFER
============================= */
exports.respondOffer = async (req, res) => {
  console.log("🎯 respondOffer hit:", req.body);
  try {
    const { offer_id, application_id, decision, candidate_notes } = req.body;
    
    if (!offer_id && !application_id) {
      return res.status(400).json({ message: "Offer ID or Application ID is required" });
    }

    let offer;
    const includeSpec = [
      { 
        model: Application, 
        as: "application",
        include: [{ model: Candidate, include: [User] }, Job]
      }
    ];

    if (offer_id) {
      offer = await Offer.findByPk(offer_id, { include: includeSpec });
    } else if (application_id) {
      offer = await Offer.findOne({ 
        where: { application_id }, 
        include: includeSpec 
      });
    }

    if (!offer && application_id) {
      // Fallback: If offer record is missing but application is in an offer-ready state, create it
      const application = await Application.findByPk(application_id, { include: [{ model: Candidate, include: [User] }, Job] });
      if (application && ["SELECTED", "OFFER_SENT", "OFFERED"].includes(application.status)) {
        console.log("🛠️ Auto-creating missing offer record for application:", application_id);
        offer = await Offer.create({
          application_id: application.id,
          salary: 0, 
          joining_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          position_title: application.Job?.title || "Position",
          status: "PENDING"
        });
        // Re-fetch with associations
        offer = await Offer.findByPk(offer.id, { include: includeSpec });
      }
    }

    if (!offer) {
      return res.status(404).json({ message: "Offer record not found" });
    }

    if (req.candidate && offer.application && offer.application.candidate_id !== req.candidate.id) {
      return res.status(403).json({ message: "You are not authorized to respond to this offer" });
    }

    // Validate decision input
    const validDecisions = ["ACCEPTED", "REJECTED"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: "Invalid decision" });
    }

    if (offer.status !== "PENDING") {
      return res.status(400).json({ message: "Offer has already been responded to" });
    }

    offer.status = decision;
    offer.candidate_notes = candidate_notes;
    offer.responded_at = new Date();
    await offer.save();

    if (offer.application) {
      offer.application.status = decision === "ACCEPTED" ? "HIRED" : "OFFER_REJECTED";
      await offer.application.save();
      
      // Send Confirmation Email
      const candidateUser = offer.application.Candidate?.User;
      if (candidateUser?.email) {
        const { sendOfferConfirmationEmail } = require("../services/email.service");
        await sendOfferConfirmationEmail(
          candidateUser.email,
          candidateUser.name,
          decision,
          offer.application.Job?.title || offer.position_title || "Position",
          offer.offer_letter_content
        );
      }

      // Notify HR and MD
      try {
        const roleStr = offer.application.Job?.title || offer.position_title || "Position";
        const candidateName = candidateUser?.name || "A candidate";
        await Notification.create({
          role: "HR",
          message: `Candidate ${candidateName} has ${decision.toLowerCase()} the offer for ${roleStr}`
        });
        await Notification.create({
          role: "MD",
          message: `Candidate ${candidateName} has ${decision.toLowerCase()} the offer for ${roleStr}`
        });
      } catch (e) {
        console.error("Failed to notify HR/MD about offer response:", e);
      }
    }

    res.json({ message: `Offer ${decision.toLowerCase()} successfully`, offer });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET OFFER DETAILS
============================= */
exports.getOfferDetails = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const offer = await Offer.findOne({ 
      where: { application_id: applicationId },
      include: [{ model: Application, as: 'application' }] 
    });
    
    if (!offer) {
      return res.status(404).json({ message: "Offer record not found" });
    }

    if (req.candidate && offer.application && offer.application.candidate_id !== req.candidate.id) {
      return res.status(403).json({ message: "You are not authorized to view this offer" });
    }
    
    res.json({ offer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* =============================
   GET ALL DISPATCHED OFFERS
============================= */
exports.getDispatchedOffers = async (req, res) => {
  try {
    const offers = await Offer.findAll({
      include: [
        {
          model: Application,
          as: 'application',
          include: [
            { model: Candidate, include: [User] },
            Job
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: offers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
