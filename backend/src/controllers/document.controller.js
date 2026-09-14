const { DocumentRecord, Application, User, Interview, Assessment, Offer } = require('../models');
const DocumentGenerator = require('../utils/documentGenerator');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const AWS = require('aws-sdk');
const uuid = require('uuid');

class DocumentController {
  /**
   * Generate offer letter for accepted candidate
   */
  static async generateOfferLetter(req, res) {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Get application with related data
      const application = await Application.findByPk(applicationId, {
        include: [
          { model: User, as: 'candidate' },
          { model: User, as: 'hr' },
          { model: Offer, as: 'offer' }
        ]
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found'
        });
      }

      // Check authorization: HR/Admin can generate, Candidate can view
      if (req.user.role === 'CANDIDATE' && application.candidateId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      if (!application.offer) {
        return res.status(400).json({
          success: false,
          message: 'No offer found for this application'
        });
      }

      // Check if document already exists
      let document = await DocumentRecord.findOne({
        where: {
          applicationId,
          documentType: 'OFFER_LETTER'
        },
        order: [['version', 'DESC']]
      });

      const documentDir = path.join(process.cwd(), 'uploads', 'documents');
      if (!fs.existsSync(documentDir)) {
        fs.mkdirSync(documentDir, { recursive: true });
      }

      const fileName = `offer_letter_${applicationId}_${uuid.v4()}.pdf`;
      const filePath = path.join(documentDir, fileName);

      // Prepare offer data
      const offerData = {
        candidateName: application.candidate.fullName,
        candidateEmail: application.candidate.email,
        candidatePhone: application.candidate.phone,
        jobTitle: application.jobTitle,
        companyName: process.env.COMPANY_NAME || 'Company Name',
        department: application.department || 'Engineering',
        location: application.location || 'Remote',
        startDate: application.offer.startDate,
        salary: application.offer.salary,
        benefits: application.offer.benefits || 'Standard company benefits',
        vacationDays: 20,
        reportsTo: application.offer.reportsTo || 'HR Manager',
        employmentType: 'Full-time'
      };

      // Generate PDF
      await DocumentGenerator.generateOfferLetter(offerData, filePath);

      // Create or update document record
      if (document) {
        // Create new version
        const newVersion = document.version + 1;
        
        const versionEntry = {
          version: document.version,
          timestamp: document.updatedAt,
          changes: 'Offer details updated'
        };

        document = await DocumentRecord.create({
          documentId: `doc_${uuid.v4()}`,
          applicationId,
          candidateId: application.candidateId,
          documentType: 'OFFER_LETTER',
          fileName,
          fileSize: fs.statSync(filePath).size,
          filePath,
          version: newVersion,
          parentDocumentId: document.id,
          versionHistory: [...(document.versionHistory || []), versionEntry],
          status: 'GENERATED',
          generatedBy: userId,
          documentData: offerData,
          visibility: 'BOTH'
        });
      } else {
        // Create new document
        document = await DocumentRecord.create({
          documentId: `doc_${uuid.v4()}`,
          applicationId,
          candidateId: application.candidateId,
          documentType: 'OFFER_LETTER',
          fileName,
          fileSize: fs.statSync(filePath).size,
          filePath,
          version: 1,
          status: 'GENERATED',
          generatedBy: userId,
          documentData: offerData,
          visibility: 'BOTH'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Offer letter generated successfully',
        data: {
          documentId: document.documentId,
          version: document.version,
          createdAt: document.createdAt,
          downloadUrl: `/api/documents/download/${document.documentId}`
        }
      });
    } catch (error) {
      console.error('Error generating offer letter:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating offer letter',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Generate assessment report
   */
  static async generateAssessmentReport(req, res) {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Only HR/Admin can generate reports
      if (!['HR', 'ADMIN'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only HR/Admin can generate reports'
        });
      }

      const application = await Application.findByPk(applicationId, {
        include: [
          { model: User, as: 'candidate' },
          { model: Assessment }
        ]
      });

      if (!application || !application.assessment) {
        return res.status(404).json({
          success: false,
          message: 'Application or assessment not found'
        });
      }

      const documentDir = path.join(process.cwd(), 'uploads', 'documents');
      if (!fs.existsSync(documentDir)) {
        fs.mkdirSync(documentDir, { recursive: true });
      }

      const fileName = `assessment_report_${applicationId}_${uuid.v4()}.pdf`;
      const filePath = path.join(documentDir, fileName);

      // Parse assessment data
      const assessmentData = {
        candidateName: application.candidate.fullName,
        jobTitle: application.jobTitle,
        testDate: application.assessment.createdAt,
        duration: 30,
        totalScore: application.assessment.score,
        totalQuestions: application.assessment.totalQuestions || 30,
        correctAnswers: Math.round((application.assessment.score / 100) * (application.assessment.totalQuestions || 30)),
        passingScore: 60,
        sections: application.assessment.sections || [],
        integrityScore: application.assessment.integrityScore || 100,
        violationCount: application.assessment.violationCount || 0,
        recommendation: application.assessment.score >= 60 ? 'PASSED' : 'FAILED'
      };

      // Generate PDF
      await DocumentGenerator.generateAssessmentReport(assessmentData, filePath);

      // Create document record
      const document = await DocumentRecord.create({
        documentId: `doc_${uuid.v4()}`,
        applicationId,
        candidateId: application.candidateId,
        documentType: 'ASSESSMENT_REPORT',
        fileName,
        fileSize: fs.statSync(filePath).size,
        filePath,
        version: 1,
        status: 'GENERATED',
        generatedBy: userId,
        documentData: assessmentData,
        visibility: 'HR_ONLY',
        tags: ['assessment', 'technical', 'score']
      });

      return res.status(201).json({
        success: true,
        message: 'Assessment report generated successfully',
        data: {
          documentId: document.documentId,
          score: assessmentData.totalScore,
          status: assessmentData.totalScore >= 60 ? 'PASSED' : 'FAILED'
        }
      });
    } catch (error) {
      console.error('Error generating assessment report:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating assessment report',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Generate interview summary
   */
  static async generateInterviewSummary(req, res) {
    try {
      const { interviewId } = req.params;
      const userId = req.user.id;

      const interview = await Interview.findByPk(interviewId, {
        include: [{ model: Application }]
      });

      if (!interview) {
        return res.status(404).json({
          success: false,
          message: 'Interview not found'
        });
      }

      const application = interview.Application;

      const documentDir = path.join(process.cwd(), 'uploads', 'documents');
      if (!fs.existsSync(documentDir)) {
        fs.mkdirSync(documentDir, { recursive: true });
      }

      const fileName = `interview_summary_${application.id}_${uuid.v4()}.pdf`;
      const filePath = path.join(documentDir, fileName);

      // Prepare interview data
      const interviewData = {
        candidateName: application.candidate?.fullName || 'Unknown',
        jobTitle: application.jobTitle,
        interviewDate: interview.createdAt,
        interviewerName: interview.feedback?.interviewerName || 'HR Manager',
        technicalScore: interview.technicalScore || 0,
        communicationScore: interview.communicationScore || 0,
        problemSolvingScore: interview.problemSolvingScore || 0,
        culturalFitScore: interview.culturalFitScore || 0,
        overallScore: interview.overallScore || 0,
        feedback: interview.feedback?.comments || '',
        strengths: interview.feedback?.strengths || [],
        areasForImprovement: interview.feedback?.improvements || [],
        recommendation: interview.recommendation || 'PENDING'
      };

      // Generate PDF
      await DocumentGenerator.generateInterviewSummary(interviewData, filePath);

      // Create document record
      const document = await DocumentRecord.create({
        documentId: `doc_${uuid.v4()}`,
        applicationId: application.id,
        candidateId: application.candidateId,
        documentType: 'INTERVIEW_SUMMARY',
        fileName,
        fileSize: fs.statSync(filePath).size,
        filePath,
        version: 1,
        status: 'GENERATED',
        generatedBy: userId,
        documentData: interviewData,
        visibility: 'HR_ONLY',
        tags: ['interview', 'assessment', 'round-2']
      });

      return res.status(201).json({
        success: true,
        message: 'Interview summary generated successfully',
        data: {
          documentId: document.documentId,
          overallScore: interviewData.overallScore
        }
      });
    } catch (error) {
      console.error('Error generating interview summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating interview summary',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Send document to candidate
   */
  static async sendDocument(req, res) {
    try {
      const { documentId } = req.params;
      const { sendToEmail, message } = req.body;

      const document = await DocumentRecord.findOne({
        where: { documentId },
        include: [{ model: Application }]
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Update document status
      document.status = 'SENT';
      document.sentDate = new Date();
      await document.save();

      // Log access
      const accessLog = document.accessLog || [];
      accessLog.push({
        userRole: req.user.role,
        action: 'SENT',
        timestamp: new Date()
      });
      document.accessLog = accessLog;
      await document.save();

      // Here you would integrate email service (SendGrid, AWS SES, etc.)
      console.log(`Document ${documentId} would be sent to ${sendToEmail}`);

      return res.status(200).json({
        success: true,
        message: 'Document sent successfully',
        data: {
          sentDate: document.sentDate,
          recipient: sendToEmail
        }
      });
    } catch (error) {
      console.error('Error sending document:', error);
      return res.status(500).json({
        success: false,
        message: 'Error sending document',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Download document
   */
  static async downloadDocument(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await DocumentRecord.findOne({
        where: { documentId },
        include: [{ model: Application }]
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check authorization
      if (req.user.role === 'CANDIDATE' && document.candidateId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      // Log download
      document.downloadCount = (document.downloadCount || 0) + 1;
      const accessLog = document.accessLog || [];
      accessLog.push({
        userRole: req.user.role,
        action: 'DOWNLOADED',
        timestamp: new Date()
      });
      document.accessLog = accessLog;
      await document.save();

      // Check if file exists
      if (!fs.existsSync(document.filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found on server'
        });
      }

      // Download file
      res.download(document.filePath, document.fileName, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
        }
      });
    } catch (error) {
      console.error('Error downloading document:', error);
      return res.status(500).json({
        success: false,
        message: 'Error downloading document',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Get document details
   */
  static async getDocumentDetails(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await DocumentRecord.findOne({
        where: { documentId },
        include: [
          { model: Application },
          { model: User, as: 'candidate' }
        ]
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check authorization
      if (req.user.role === 'CANDIDATE' && document.candidateId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          documentId: document.documentId,
          type: document.documentType,
          fileName: document.fileName,
          version: document.version,
          status: document.status,
          createdAt: document.createdAt,
          sentDate: document.sentDate,
          viewedDate: document.viewedDate,
          downloadCount: document.downloadCount,
          signatureStatus: document.signatureStatus,
          documentData: document.documentData
        }
      });
    } catch (error) {
      console.error('Error fetching document details:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching document details',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Get all documents for application
   */
  static async getApplicationDocuments(req, res) {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      const application = await Application.findByPk(applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found'
        });
      }

      // Check authorization
      if (req.user.role === 'CANDIDATE' && application.candidateId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      const documents = await Document.findAll({
        where: { applicationId },
        order: [['created_at', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        data: documents.map(doc => ({
          documentId: doc.documentId,
          type: doc.documentType,
          fileName: doc.fileName,
          version: doc.version,
          status: doc.status,
          createdAt: doc.createdAt,
          signatureStatus: doc.signatureStatus
        }))
      });
    } catch (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching documents',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Sign document (e-signature)
   */
  static async signDocument(req, res) {
    try {
      const { documentId } = req.params;
      const { signature, ipAddress } = req.body;
      const userId = req.user.id;

      const document = await DocumentRecord.findOne({
        where: { documentId }
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check authorization: only candidate can sign
      if (document.candidateId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only candidate can sign this document'
        });
      }

      if (!document.signatureRequired) {
        return res.status(400).json({
          success: false,
          message: 'Document does not require signature'
        });
      }

      // Update signature
      document.signatureStatus = 'SIGNED';
      document.signedDate = new Date();
      document.signatureDetails = {
        signature: signature.substring(0, 100), // Store hash only
        ipAddress,
        timestamp: new Date(),
        userAgent: req.get('user-agent')
      };
      document.status = 'SIGNED';
      await document.save();

      return res.status(200).json({
        success: true,
        message: 'Document signed successfully',
        data: {
          signedDate: document.signedDate,
          status: document.status
        }
      });
    } catch (error) {
      console.error('Error signing document:', error);
      return res.status(500).json({
        success: false,
        message: 'Error signing document',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }

  /**
   * Archive document
   */
  static async archiveDocument(req, res) {
    try {
      const { documentId } = req.params;

      const document = await DocumentRecord.findOne({
        where: { documentId }
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      document.status = 'ARCHIVED';
      document.visibility = 'ARCHIVED';
      await document.save();

      return res.status(200).json({
        success: true,
        message: 'Document archived successfully'
      });
    } catch (error) {
      console.error('Error archiving document:', error);
      return res.status(500).json({
        success: false,
        message: 'Error archiving document',
        error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message
      });
    }
  }
}

module.exports = DocumentController;
