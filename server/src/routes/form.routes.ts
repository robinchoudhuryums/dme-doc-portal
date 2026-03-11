import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { FormSubmissionModel } from '../models/form-submission.model';
import { AuditLogModel } from '../models/audit-log.model';
import { ReminderScheduleModel } from '../models/reminder-schedule.model';
import { requireStaffAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { generateSigningToken, generatePin, hashPin } from '../utils/crypto';
import { config } from '../config';
import { AuditAction, FormStatus, FormType, DeliveryMethod } from '../types';
import logger from '../utils/logger';

const router = Router();
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const createFormSchema = z.object({
  form_type: z.nativeEnum(FormType),
  delivery_method: z.nativeEnum(DeliveryMethod),
  physician_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reminder_days: z.array(z.number().int().positive()).optional(),
});

/** POST /api/forms — Create a new form submission (with PDF upload) */
router.post(
  '/',
  requireStaffAuth,
  upload.single('pdf'),
  validateBody(createFormSchema),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'PDF file is required' });
        return;
      }

      const signingToken = generateSigningToken();
      const pin = generatePin();
      const pinHash = await hashPin(pin);

      // In production, upload to S3 here. For now, store a placeholder key.
      const pdfKey = `forms/${signingToken}/original.pdf`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.signing.linkExpiryDays);

      const submission = await FormSubmissionModel.create({
        form_type: req.body.form_type,
        status: FormStatus.PENDING_SIGNATURE,
        delivery_method: req.body.delivery_method,
        physician_id: req.body.physician_id,
        patient_id: req.body.patient_id,
        created_by: req.staffUser!.sub,
        original_pdf_key: pdfKey,
        signing_token: signingToken,
        pin_hash: pinHash,
        expires_at: expiresAt,
      });

      // Create reminder schedules
      const reminderDays = req.body.reminder_days || config.reminders.defaultDays;
      const reminders = reminderDays.map((days: number) => ({
        form_submission_id: submission.id,
        scheduled_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        delivery_method: req.body.delivery_method,
      }));
      await ReminderScheduleModel.createBatch(reminders);

      // Audit log
      await AuditLogModel.create({
        form_submission_id: submission.id,
        action: AuditAction.FORM_CREATED,
        actor_type: 'staff',
        actor_id: req.staffUser!.sub,
        ip_address: req.ip,
        details: { form_type: req.body.form_type },
      });

      const signingUrl = `${config.signing.baseUrl}/sign/${signingToken}`;

      logger.info('Form created', { formId: submission.id });

      res.status(201).json({
        submission,
        signing_url: signingUrl,
        pin, // Return PIN once so staff can communicate it to physician separately
      });
    } catch (err) {
      logger.error('Create form error', { error: err });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/** GET /api/forms — List forms for dashboard */
router.get('/', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const { status, physician_id, page, per_page } = req.query;
    const result = await FormSubmissionModel.listForDashboard({
      status: status as FormStatus | undefined,
      physician_id: physician_id as string | undefined,
      created_by: req.staffUser!.role === 'intake' ? req.staffUser!.sub : undefined,
      page: Number(page) || 1,
      perPage: Number(per_page) || 25,
    });
    res.json(result);
  } catch (err) {
    logger.error('List forms error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/forms/stats — Dashboard statistics */
router.get('/stats', requireStaffAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await FormSubmissionModel.getStats();
    res.json(stats);
  } catch (err) {
    logger.error('Get stats error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /api/forms/:id — Get form details */
router.get('/:id', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmissionModel.findById(req.params.id);
    if (!submission) {
      res.status(404).json({ error: 'Form not found' });
      return;
    }

    const auditLogs = await AuditLogModel.findByFormSubmission(submission.id);
    const reminders = await ReminderScheduleModel.findByFormSubmission(submission.id);

    res.json({ submission, audit_logs: auditLogs, reminders });
  } catch (err) {
    logger.error('Get form error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/forms/:id/cancel — Cancel a pending form */
router.post('/:id/cancel', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmissionModel.findById(req.params.id);
    if (!submission) {
      res.status(404).json({ error: 'Form not found' });
      return;
    }
    if (submission.status === FormStatus.SIGNED) {
      res.status(400).json({ error: 'Cannot cancel a signed form' });
      return;
    }

    await FormSubmissionModel.updateStatus(submission.id, FormStatus.CANCELLED);
    await ReminderScheduleModel.cancelByFormSubmission(submission.id);

    await AuditLogModel.create({
      form_submission_id: submission.id,
      action: AuditAction.FORM_CANCELLED,
      actor_type: 'staff',
      actor_id: req.staffUser!.sub,
      ip_address: req.ip,
    });

    res.json({ message: 'Form cancelled' });
  } catch (err) {
    logger.error('Cancel form error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
