/**
 * Phase 7: Enhanced Proctoring Controller
 * Real-time exam monitoring and behavioral analysis
 */

const { Application, AssessmentAttempt, User, ApplicationStatusLog, MalpracticeEvent, Candidate, Job, InterviewSession } = require('../models');
const { BehavioralAnalyzer, AnomalyDetector, IntegrityValidator } = require('../utils/proctoring.utils');
const { sendEmail } = require('../services/email.service');
const crypto = require('crypto');

// ==================== PROCTORING CONTROLLER ====================

class ProctoringController {
  /**
   * Start proctored assessment
   * POST /api/proctoring/start/:applicationId
   */
  static async startProctoredAssessment(req, res) {
    try {
      const { applicationId } = req.params;
      const candidateId = req.candidate.id;
      const { deviceInfo, browserInfo, environmentInfo } = req.body;

      // Validate application access
      const application = await Application.findByPk(applicationId);

      if (!application || application.candidate_id !== candidateId) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      // Check application status
      if (!['TECHNICAL_ROUND_PENDING', 'TECHNICAL_ROUND_IN_PROGRESS'].includes(application.status)) {
        return res.status(400).json({
          success: false,
          message: 'Application not in assessment stage'
        });
      }

      // Perform pre-assessment security checks
      const preChecks = await ProctoringController._performPreAssessmentChecks(
        deviceInfo,
        browserInfo,
        environmentInfo
      );

      if (!preChecks.passed) {
        return res.status(400).json({
          success: false,
          message: 'Pre-assessment security check failed',
          violations: preChecks.violations,
          allowContinue: preChecks.allowContinue
        });
      }

      // Find or create AssessmentAttempt
      let attempt = await AssessmentAttempt.findOne({
        where: { application_id: applicationId }
      });

      if (attempt && attempt.status === 'SUBMITTED') {
        return res.status(400).json({
          success: false,
          message: 'Assessment already submitted'
        });
      }

      const proctoringData = {
        startTime: new Date(),
        deviceInfo,
        browserInfo,
        environmentInfo,
        events: [],
        anomalies: [],
        flags: [],
        behavioralProfile: {},
        integrityScore: 100,
        suspiciousActivityScore: 0
      };

      if (!attempt) {
        attempt = await AssessmentAttempt.create({
          application_id: applicationId,
          assessment_type: 'TECHNICAL',
          status: 'IN_PROGRESS',
          started_at: new Date(),
          device_info: deviceInfo,
          anti_cheating_data: proctoringData
        });
      } else {
        const existingData = attempt.anti_cheating_data || proctoringData;
        if (attempt.status === 'IN_PROGRESS' && attempt.anti_cheating_data) {
           // We just keep existing data and do not error out for page reloads
        }
        await attempt.update({
          status: 'IN_PROGRESS',
          anti_cheating_data: existingData
        });
      }

      // Update application status
      await application.update({
        status: 'TECHNICAL_ROUND_IN_PROGRESS'
      });

      // Log status change
      await ApplicationStatusLog.create({
        application_id: application.id,
        previous_status: 'TECHNICAL_ROUND_PENDING',
        new_status: 'TECHNICAL_ROUND_IN_PROGRESS',
        changed_by: candidateId,
        notes: 'Proctored assessment started',
        metadata: {
          attemptId: attempt.id,
          integrityChecksPassed: true
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Proctored assessment started',
        data: {
          sessionId: attempt.id,
          preChecksPassed: true,
          warnings: preChecks.warnings || [],
          config: {
            allowCameraDisable: false,
            allowMicDisable: false,
            allowMultipleMonitors: false,
            allowExternalDevices: false,
            screensharingDetection: true,
            audioAnalysisEnabled: true,
            recordingEnabled: true
          }
        }
      });
    } catch (error) {
      console.error('Start proctoring error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to start proctored assessment' });
    }
  }

  /**
   * Track real-time events during assessment
   * POST /api/proctoring/events/:sessionId
   */
  static async trackEvent(req, res) {
    try {
      const { sessionId } = req.params;
      const { eventType, eventData, timestamp } = req.body;

      if (!eventType || !eventData) {
        return res.status(400).json({
          success: false,
          message: 'Event type and data required'
        });
      }

      const attempt = await AssessmentAttempt.findByPk(sessionId);

      if (!attempt) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      const proctoringData = attempt.anti_cheating_data || { events: [], anomalies: [], flags: [] };
      
      // Record event
      const event = {
        eventId: crypto.randomUUID(),
        type: eventType,
        data: eventData,
        timestamp: timestamp || new Date(),
        severity: 'INFO'
      };

      proctoringData.events = proctoringData.events || [];
      proctoringData.events.push(event);

      // Analyze event for anomalies
      const anomalyDetector = new AnomalyDetector();
      const anomaly = anomalyDetector.detectAnomaly(eventType, eventData, proctoringData);

      if (anomaly) {
        proctoringData.anomalies = proctoringData.anomalies || [];
        proctoringData.anomalies.push(anomaly);
        event.severity = anomaly.severity;

        // Update suspicion score
        proctoringData.suspiciousActivityScore = Math.min(
          100,
          (proctoringData.suspiciousActivityScore || 0) + anomaly.riskScore
        );

        // Record as MalpracticeEvent if severe
        if (['HIGH', 'CRITICAL'].includes(anomaly.severity)) {
          await MalpracticeEvent.create({
            application_id: attempt.application_id,
            type: eventType,
            severity: anomaly.severity === 'CRITICAL' ? 5 : 3,
            meta: { anomaly, eventData }
          });
        }
      }

      // Check event criticality
      const flagged = ProctoringController._checkEventCriticality(eventType, eventData, proctoringData);

      if (flagged) {
        proctoringData.flags = proctoringData.flags || [];
        proctoringData.flags.push(flagged);
      }

      await attempt.update({ anti_cheating_data: proctoringData });

      return res.status(200).json({
        success: true,
        message: 'Event tracked',
        data: {
          eventId: event.eventId,
          recorded: true,
          anomalyDetected: !!anomaly,
          riskScore: proctoringData.suspiciousActivityScore,
          sessionStatus: 'ACTIVE'
        }
      });
    } catch (error) {
      console.error('Track event error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to track event' });
    }
  }

  /**
   * Monitor audio/video during assessment
   * POST /api/proctoring/monitor/:sessionId
   */
  static async monitorMedia(req, res) {
    try {
      const { sessionId } = req.params;
      const { audioData, videoMetrics, screenShare } = req.body;

      const attempt = await AssessmentAttempt.findByPk(sessionId);
      if (!attempt) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      const proctoringData = attempt.anti_cheating_data || {};
      proctoringData.audioDetections = proctoringData.audioDetections || [];
      proctoringData.videoMetrics = proctoringData.videoMetrics || {};

      // Audio analysis removed as it is currently a stub
      // Monitor video metrics
      if (videoMetrics) {
        const videoAnalysis = ProctoringController._analyzeVideo(videoMetrics);

        proctoringData.videoMetrics = {
          ...proctoringData.videoMetrics,
          ...videoAnalysis
        };

        if (videoAnalysis.faceNotDetected) {
          proctoringData.audioDetections.push({
            timestamp: new Date(),
            type: 'FACE_NOT_DETECTED',
            severity: 'CRITICAL',
            message: 'Face not detected in frame'
          });
        }
      }

      // Detect screen sharing
      if (screenShare) {
        proctoringData.flags = proctoringData.flags || [];
        proctoringData.flags.push({
          timestamp: new Date(),
          type: 'SCREEN_SHARE_DETECTED',
          severity: 'CRITICAL',
          message: 'Screen sharing or external display detected'
        });
      }

      await attempt.update({ anti_cheating_data: proctoringData });

      return res.status(200).json({
        success: true,
        message: 'Media monitored',
        data: {
          audioDetections: proctoringData.audioDetections,
          videoMetrics: proctoringData.videoMetrics,
          alerts: proctoringData.audioDetections.length > 0 ? proctoringData.audioDetections : []
        }
      });
    } catch (error) {
      console.error('Monitor media error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to monitor media' });
    }
  }

  /**
   * Detect behavioral patterns during assessment
   * POST /api/proctoring/behavior/:sessionId
   */
  static async analyzeBehavior(req, res) {
    try {
      const { sessionId } = req.params;
      const { keyboardMetrics, mouseMetrics, focusEvents, navigationEvents } = req.body;

      const attempt = await AssessmentAttempt.findByPk(sessionId);
      if (!attempt) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      const proctoringData = attempt.anti_cheating_data || {};
      const behavioralAnalyzer = new BehavioralAnalyzer();

      let behavioralRisks = [];

      // Analyze keyboard behavior
      if (keyboardMetrics) {
        const keyboardAnalysis = behavioralAnalyzer.analyzeKeyboardBehavior(keyboardMetrics);
        proctoringData.keyboardMetrics = keyboardAnalysis;

        if (keyboardAnalysis.suspiciousPattern) {
          behavioralRisks.push({
            type: 'KEYBOARD_ANOMALY',
            severity: keyboardAnalysis.severity,
            message: keyboardAnalysis.message,
            riskScore: keyboardAnalysis.riskScore
          });
        }
      }

      // Analyze mouse behavior
      if (mouseMetrics) {
        const mouseAnalysis = behavioralAnalyzer.analyzeMouseBehavior(mouseMetrics);
        proctoringData.mouseMetrics = mouseAnalysis;

        if (mouseAnalysis.suspiciousPattern) {
          behavioralRisks.push({
            type: 'MOUSE_ANOMALY',
            severity: mouseAnalysis.severity,
            message: mouseAnalysis.message,
            riskScore: mouseAnalysis.riskScore
          });
        }
      }

      // Analyze focus patterns
      if (focusEvents) {
        const focusAnalysis = behavioralAnalyzer.analyzeFocusPattern(focusEvents);
        proctoringData.focusHistory = focusEvents;

        if (focusAnalysis.suspiciousPattern) {
          behavioralRisks.push({
            type: 'FOCUS_ANOMALY',
            severity: focusAnalysis.severity,
            message: focusAnalysis.message,
            riskScore: focusAnalysis.riskScore
          });
        }
      }

      // Detect unauthorized navigation
      if (navigationEvents) {
        const navAnalysis = behavioralAnalyzer.analyzeNavigationPattern(navigationEvents);

        if (navAnalysis.suspiciousNavigation) {
          behavioralRisks.push({
            type: 'NAVIGATION_ANOMALY',
            severity: 'HIGH',
            message: navAnalysis.message,
            riskScore: navAnalysis.riskScore
          });
        }
      }

      proctoringData.behavioralRisks = behavioralRisks;
      await attempt.update({ anti_cheating_data: proctoringData });

      return res.status(200).json({
        success: true,
        message: 'Behavior analyzed',
        data: {
          behavioralRisks,
          riskCount: behavioralRisks.length,
          recommendation: behavioralRisks.length > 3 ? 'FLAG_FOR_REVIEW' : 'CONTINUE'
        }
      });
    } catch (error) {
      console.error('Analyze behavior error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to analyze behavior' });
    }
  }

  /**
   * End proctored assessment and generate report
   * POST /api/proctoring/end/:sessionId
   */
  static async endProctoredAssessment(req, res) {
    try {
      const { sessionId } = req.params;
      const candidateId = req.candidate?.id;

      const attempt = await AssessmentAttempt.findByPk(sessionId, {
        include: [{ model: Application }]
      });

      if (!attempt || (candidateId && attempt.Application.candidate_id !== candidateId)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized or session not found'
        });
      }

      const proctoringData = attempt.anti_cheating_data || {};
      
      // Calculate final integrity score
      const integrityValidator = new IntegrityValidator();
      const integrityReport = integrityValidator.validateAssessmentIntegrity(proctoringData);

      proctoringData.integrityScore = integrityReport.integrityScore;
      proctoringData.suspiciousActivityScore = integrityReport.suspiciousActivityScore;
      proctoringData.recommendedAction = integrityReport.recommendedAction;
      proctoringData.endTime = new Date();

      // Retrieve actual score rather than trusting client
      const actualScore = attempt.final_score || attempt.score || 0;

      await attempt.update({
        status: 'SUBMITTED',
        submitted_at: new Date(),
        score: actualScore,
        anti_cheating_data: proctoringData
      });

      // Update application status
      const application = await Application.findByPk(attempt.application_id, {
        include: [
          { model: Candidate, include: [{ model: User, attributes: { exclude: ['password', 'login_code'] } }] },
          { model: Job }
        ]
      });

      let finalStatus = 'TECHNICAL_ROUND_COMPLETED';
      let finalScore = actualScore;

      const shouldInvestigate = proctoringData.integrityScore < 70 || proctoringData.suspiciousActivityScore > 40;

      // Check if needs review
      if (shouldInvestigate) {
        finalStatus = 'TECHNICAL_ROUND_COMPLETED'; // Still marked completed but flagged in logs
        // We could add a 'needs_review' flag to application if we had one
      }

      // Keep as completed even with violations, HR will review the flags
      finalStatus = 'TECHNICAL_ROUND_COMPLETED';
      finalScore = actualScore;

      await application.update({
        status: finalStatus,
        technical_score: finalScore
      });

      // Log status change
      await ApplicationStatusLog.create({
        application_id: application.id,
        previous_status: 'TECHNICAL_ROUND_IN_PROGRESS',
        new_status: finalStatus,
        changed_by: 0, // 0 for system
        notes: `Assessment completed. Integrity: ${proctoringData.integrityScore}, Suspicion: ${proctoringData.suspiciousActivityScore}`,
        metadata: {
          attemptId: sessionId,
          integrityScore: proctoringData.integrityScore,
          suspiciousActivityScore: proctoringData.suspiciousActivityScore,
          recommendedAction: proctoringData.recommendedAction
        }
      });

      // Send notification to HR if investigation needed
      if (shouldInvestigate) {
        await ProctoringController._notifyHRForReview(application, proctoringData);
      }

      return res.status(200).json({
        success: true,
        message: 'Proctored assessment completed',
        data: {
          integrityScore: proctoringData.integrityScore,
          finalStatus,
          finalScore,
          recommendation: proctoringData.recommendedAction
        }
      });
    } catch (error) {
      console.error('End proctoring error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to end proctored assessment' });
    }
  }

  /**
   * Get proctoring report (HR/ADMIN only)
   * GET /api/proctoring/report/:sessionId
   */
  static async getProctoringReport(req, res) {
    try {
      const { sessionId } = req.params;
      
      const attempt = await AssessmentAttempt.findByPk(sessionId);

      if (!attempt) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: attempt.anti_cheating_data
      });
    } catch (error) {
      console.error('Get report error:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve report' });
    }
  }

  /**
   * Log a general malpractice event
   * POST /api/proctoring/log-malpractice
   */
  static async logMalpractice(req, res) {
    try {
      const { application_id, type, meta, severity, reference_id, referenceId } = req.body;
      const targetId = application_id || reference_id || referenceId;
      const candidateId = req.candidate?.id;

      if (!targetId || !type) {
        return res.status(400).json({ success: false, message: 'application_id/reference_id and type are required' });
      }

      // Resolve application_id if targetId is a session/attempt ID
      let resolvedAppId = targetId;
      
      // Check if it's an InterviewSession ID
      const interviewSession = await InterviewSession.findByPk(targetId);
      if (interviewSession) {
        resolvedAppId = interviewSession.application_id;
      } else {
        // Check if it's an AssessmentAttempt ID
        const assessmentAttempt = await AssessmentAttempt.findByPk(targetId);
        if (assessmentAttempt) {
          resolvedAppId = assessmentAttempt.application_id;
        }
      }

      // Verify application belongs to candidate
      const app = await Application.findByPk(resolvedAppId);
      if (!app || (candidateId && app.candidate_id !== candidateId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized or application not found' });
      }

      const event = await MalpracticeEvent.create({
        application_id: resolvedAppId,
        type,
        meta: { 
          ...meta, 
          reference_id: targetId,
          timestamp: new Date()
        },
        severity: severity || 1
      });

      return res.status(201).json({ success: true, event });
    } catch (error) {
      console.error('Log malpractice error:', error);
      return res.status(500).json({ success: false, message: 'Failed to log event' });
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Generate device fingerprint
   */
  static _generateDeviceFingerprint(deviceInfo) {
    const fingerprint = JSON.stringify({
      userAgent: deviceInfo?.userAgent,
      language: deviceInfo?.language,
      timezone: deviceInfo?.timezone,
      screen: deviceInfo?.screenResolution,
      processor: deviceInfo?.processorCount
    });

    return crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex');
  }

  /**
   * Perform pre-assessment security checks
   */
  static async _performPreAssessmentChecks(deviceInfo, browserInfo, environmentInfo) {
    const violations = [];
    const warnings = [];
    let passed = true;
    let allowContinue = true;

    // Check browser
    const disallowedBrowsers = ['brave', 'tor', 'vpn'];
    const browserName = browserInfo?.name?.toLowerCase() || '';

    if (disallowedBrowsers.some(b => browserName.includes(b))) {
      violations.push(`Browser not allowed: ${browserInfo?.name}`);
      passed = false;
    }

    // Check for VPN
    if (environmentInfo?.vpnDetected) {
      violations.push('VPN or proxy detected');
      passed = false;
    }

    // Check monitor count
    if (environmentInfo?.monitorCount > 1) {
      warnings.push(`Multiple monitors detected (${environmentInfo.monitorCount})`);
    }

    // Check for virtual machine
    if (environmentInfo?.isVirtualMachine) {
      warnings.push('Virtual machine environment detected');
    }

    // Check for remote access
    if (environmentInfo?.remoteAccessDetected) {
      violations.push('Remote access tools detected');
      passed = false;
    }

    return {
      passed,
      allowContinue,
      violations,
      warnings
    };
  }


  /**
   * Analyze video metrics
   */
  static _analyzeVideo(videoMetrics) {
    return {
      faceDetected: videoMetrics?.faceDetected !== false,
      faceNotDetected: !videoMetrics?.faceDetected,
      brightness: videoMetrics?.brightness,
      faceFrameCoverage: videoMetrics?.faceFrameCoverage,
      eyeContact: videoMetrics?.eyeContact
    };
  }

  /**
   * Check event criticality
   */
  static _checkEventCriticality(eventType, eventData, proctoringData) {
    const criticalEvents = {
      'TAB_SWITCH': { severity: 'HIGH', message: 'Focus lost from exam window' },
      'PRINT_ATTEMPT': { severity: 'CRITICAL', message: 'Print attempt detected' },
      'COPY_PASTE': { severity: 'HIGH', message: 'Copy/paste attempt detected' },
      'RIGHT_CLICK': { severity: 'MEDIUM', message: 'Right-click detected' },
      'DEVELOPER_TOOLS': { severity: 'CRITICAL', message: 'Developer tools opened' },
      'FULLSCREEN_EXIT': { severity: 'HIGH', message: 'Exited fullscreen mode' }
    };

    if (criticalEvents[eventType]) {
      return {
        timestamp: new Date(),
        type: eventType,
        ...criticalEvents[eventType],
        data: eventData
      };
    }

    return null;
  }

  /**
   * Notify HR for review
   */
  static async _notifyHRForReview(application, proctoringData) {
    try {
      const hrUsers = await User.findAll({
        where: { role: 'HR' }
      });

      const emailPromises = hrUsers.map(hr =>
        sendEmail({
          to: hr.email,
          subject: 'Assessment Requires Manual Review',
          template: 'assessment-review-required',
          data: {
            candidateName: application.Candidate?.firstName || 'Candidate',
            jobTitle: application.Job?.title || 'Job',
            integrityScore: proctoringData.integrityScore,
            violationCount: (proctoringData.anomalies?.length || 0) + (proctoringData.flags?.length || 0),
            applicationId: application.id
          }
        }).catch(err => console.error(`Failed to send email to ${hr.email}:`, err.message))
      );

      await Promise.all(emailPromises);
    } catch (error) {
      console.error('Notify HR error:', error);
    }
  }
}

module.exports = ProctoringController;
