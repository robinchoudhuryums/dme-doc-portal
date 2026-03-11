import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FormSubmissionModel } from '../models/form-submission.model';
import { AuditLogModel } from '../models/audit-log.model';
import { ReminderScheduleModel } from '../models/reminder-schedule.model';
import { PhysicianModel } from '../models/physician.model';
import { PatientModel } from '../models/patient.model';
import { StaffUserModel } from '../models/staff-user.model';
import { verifyPin } from '../utils/crypto';
import { generatePhysicianSessionToken, requirePhysicianSession } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { S3Service } from '../services/s3.service';
import { PdfService } from '../services/pdf.service';
import { EmailService } from '../services/email.service';
import { NotificationService } from '../services/notification.service';
import { config } from '../config';
import { AuditAction, FormStatus, FormType } from '../types';
import logger from '../utils/logger';

const router = Router();

const verifyPinSchema = z.object({
  pin: z.string().min(1),
});

const saveSectionBSchema = z.object({
  section_b_data: z.record(z.unknown()),
});

const signSchema = z.object({
  signature_data: z.string().min(1),
});

/**
 * GET /api/sign/:token — Get form info (public, before PIN)
 * Returns minimal info: form type, physician name, status.
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmissionModel.findByToken(req.params.token);
    if (!submission) {
      res.status(404).json({ error: 'Form not found or link is invalid' });
      return;
    }

    if (submission.status === FormStatus.EXPIRED || new Date() > new Date(submission.expires_at)) {
      res.status(410).json({ error: 'This signing link has expired' });
      return;
    }

    if (submission.status === FormStatus.SIGNED) {
      res.status(400).json({ error: 'This form has already been signed' });
      return;
    }

    if (submission.status === FormStatus.CANCELLED) {
      res.status(400).json({ error: 'This form has been cancelled' });
      return;
    }

    await AuditLogModel.create({
      form_submission_id: submission.id,
      action: AuditAction.LINK_OPENED,
      actor_type: 'physician',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({
      form_type: submission.form_type,
      status: submission.status,
      requires_pin: true,
    });
  } catch (err) {
    logger.error('Get signing form error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sign/:token/verify — Verify PIN and get session token
 */
router.post('/:token/verify', validateBody(verifyPinSchema), async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmissionModel.findByToken(req.params.token);
    if (!submission) {
      res.status(404).json({ error: 'Form not found' });
      return;
    }

    if (submission.pin_attempts >= config.signing.maxPinAttempts) {
      res.status(429).json({ error: 'Too many PIN attempts. Please contact Universal Medical Supply.' });
      return;
    }

    const valid = await verifyPin(req.body.pin, submission.pin_hash);
    if (!valid) {
      await FormSubmissionModel.incrementPinAttempts(submission.id);
      await AuditLogModel.create({
        form_submission_id: submission.id,
        action: AuditAction.PIN_FAILED,
        actor_type: 'physician',
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      });
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }

    // PIN verified — issue session token
    await FormSubmissionModel.resetPinAttempts(submission.id);
    if (submission.status === FormStatus.PENDING_SIGNATURE) {
      await FormSubmissionModel.updateStatus(submission.id, FormStatus.VIEWED);
    }

    const sessionToken = generatePhysicianSessionToken(submission.id, submission.physician_id);

    await AuditLogModel.create({
      form_submission_id: submission.id,
      action: AuditAction.PIN_VERIFIED,
      actor_type: 'physician',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({
      session_token: sessionToken,
      form_type: submission.form_type,
      section_b_data: submission.section_b_data,
    });
  } catch (err) {
    logger.error('Verify PIN error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sign/:token/section-b — Save Section B clinical data
 */
router.post(
  '/:token/section-b',
  requirePhysicianSession,
  validateBody(saveSectionBSchema),
  async (req: Request, res: Response) => {
    try {
      const submission = await FormSubmissionModel.findByToken(req.params.token);
      if (!submission || submission.id !== req.physicianSession!.sub) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await FormSubmissionModel.saveSectionB(submission.id, req.body.section_b_data);

      await AuditLogModel.create({
        form_submission_id: submission.id,
        action: AuditAction.SECTION_B_SAVED,
        actor_type: 'physician',
        actor_id: submission.physician_id,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      });

      res.json({ message: 'Section B saved' });
    } catch (err) {
      logger.error('Save section B error', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/sign/:token/sign — Submit electronic signature
 */
router.post(
  '/:token/sign',
  requirePhysicianSession,
  validateBody(signSchema),
  async (req: Request, res: Response) => {
    try {
      const submission = await FormSubmissionModel.findByToken(req.params.token);
      if (!submission || submission.id !== req.physicianSession!.sub) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (submission.status === FormStatus.SIGNED) {
        res.status(400).json({ error: 'Form already signed' });
        return;
      }

      const signedAt = new Date();
      const signerIp = req.ip || 'unknown';
      const signerUserAgent = req.get('user-agent') || 'unknown';

      // Download original PDF, generate signed version with Section B + signature
      const originalPdf = await S3Service.downloadPdf(submission.original_pdf_key);
      const physician = await PhysicianModel.findById(submission.physician_id);
      const physicianName = physician ? `${physician.first_name} ${physician.last_name}` : 'Unknown';

      const signedPdfBuffer = await PdfService.generateSignedPdf({
        originalPdfBuffer: originalPdf,
        formType: submission.form_type as FormType,
        sectionBData: (submission.section_b_data as Record<string, unknown>) || {},
        signatureDataUrl: req.body.signature_data,
        physicianName,
        signerIp,
        signedAt,
      });

      // Upload signed PDF to S3
      const signedPdfKey = `forms/${submission.signing_token}/signed.pdf`;
      await S3Service.uploadPdf(signedPdfKey, signedPdfBuffer);

      await AuditLogModel.create({
        form_submission_id: submission.id,
        action: AuditAction.SIGNED_PDF_GENERATED,
        actor_type: 'system',
        details: { signed_pdf_key: signedPdfKey },
      });

      // Record signature in database
      await FormSubmissionModel.recordSignature(submission.id, {
        signature_data: req.body.signature_data,
        signed_pdf_key: signedPdfKey,
        signer_ip: signerIp,
        signer_user_agent: signerUserAgent,
      });

      // Cancel pending reminders
      await ReminderScheduleModel.cancelByFormSubmission(submission.id);

      await AuditLogModel.create({
        form_submission_id: submission.id,
        action: AuditAction.FORM_SIGNED,
        actor_type: 'physician',
        actor_id: submission.physician_id,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        details: { signed_at: signedAt.toISOString() },
      });

      logger.info('Form signed', { formId: submission.id });

      // Send webhook notification
      await NotificationService.notifyFormSigned({
        form_id: submission.id,
        form_type: submission.form_type,
        physician_id: submission.physician_id,
        patient_id: submission.patient_id,
        signed_at: signedAt.toISOString(),
        signed_pdf_key: signedPdfKey,
      });

      // Notify UMS staff via email
      const patient = await PatientModel.findById(submission.patient_id);
      const patientInitials = patient ? `${patient.first_name[0]}${patient.last_name[0]}` : '??';
      const staffUser = await StaffUserModel.findById(submission.created_by);
      if (staffUser?.email) {
        await EmailService.notifyStaffFormSigned({
          staffEmail: staffUser.email,
          physicianName,
          patientInitials,
          formType: submission.form_type,
          formId: submission.id,
          signedAt: signedAt.toISOString(),
        });
      }

      res.json({ message: 'Form signed successfully' });
    } catch (err) {
      logger.error('Sign form error', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
