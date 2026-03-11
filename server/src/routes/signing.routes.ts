import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FormSubmissionModel } from '../models/form-submission.model';
import { AuditLogModel } from '../models/audit-log.model';
import { ReminderScheduleModel } from '../models/reminder-schedule.model';
import { verifyPin } from '../utils/crypto';
import { generatePhysicianSessionToken, requirePhysicianSession } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { config } from '../config';
import { AuditAction, FormStatus } from '../types';
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

      // In production: generate signed PDF with pdf-lib, upload to S3
      const signedPdfKey = `forms/${submission.signing_token}/signed.pdf`;

      await FormSubmissionModel.recordSignature(submission.id, {
        signature_data: req.body.signature_data,
        signed_pdf_key: signedPdfKey,
        signer_ip: req.ip || 'unknown',
        signer_user_agent: req.get('user-agent') || 'unknown',
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
        details: {
          signed_at: new Date().toISOString(),
        },
      });

      logger.info('Form signed', { formId: submission.id });

      // TODO: Send webhook/email notification to UMS staff

      res.json({ message: 'Form signed successfully' });
    } catch (err) {
      logger.error('Sign form error', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
