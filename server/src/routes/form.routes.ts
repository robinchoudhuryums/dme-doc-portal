import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import QRCode from 'qrcode';
import { FormSubmissionModel } from '../models/form-submission.model';
import { AuditLogModel } from '../models/audit-log.model';
import { ReminderScheduleModel } from '../models/reminder-schedule.model';
import { PhysicianModel } from '../models/physician.model';
import { PatientModel } from '../models/patient.model';
import { requireStaffAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { generateSigningToken, generatePin, hashPin } from '../utils/crypto';
import { S3Service } from '../services/s3.service';
import { PdfService } from '../services/pdf.service';
import { FaxService } from '../services/fax.service';
import { EmailService } from '../services/email.service';
import { config } from '../config';
import { AuditAction, FormStatus, FormType, DeliveryMethod } from '../types';
import { safeInitials } from '../utils/helpers';
import logger from '../utils/logger';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
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

      // Upload original PDF to S3
      const pdfKey = `forms/${signingToken}/original.pdf`;
      await S3Service.uploadPdf(pdfKey, req.file.buffer);

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

      // Send signing link to physician via configured delivery method
      const physician = await PhysicianModel.findById(req.body.physician_id);
      const patient = await PatientModel.findById(req.body.patient_id);
      const physicianName = physician ? `${physician.first_name} ${physician.last_name}` : 'Unknown';
      const patientInitials = patient ? safeInitials(patient.first_name, patient.last_name) : '??';

      if (
        (req.body.delivery_method === DeliveryMethod.FAX || req.body.delivery_method === DeliveryMethod.BOTH)
        && physician?.fax_number
      ) {
        const qrCodeDataUrl = await QRCode.toDataURL(signingUrl, { width: 200, margin: 1 });
        const coverPdf = await PdfService.generateCoverSheet({
          physicianName,
          patientInitials,
          formType: req.body.form_type,
          signingUrl,
          qrCodeDataUrl,
        });
        const faxResult = await FaxService.sendFax({
          to: physician.fax_number,
          pdfBuffer: coverPdf,
          subject: `CMN ${req.body.form_type} — Patient ${patientInitials}`,
        });

        await AuditLogModel.create({
          form_submission_id: submission.id,
          action: AuditAction.FAX_SENT,
          actor_type: 'system',
          details: { success: faxResult.success, fax_id: faxResult.faxId },
        });
      }

      if (
        (req.body.delivery_method === DeliveryMethod.EMAIL || req.body.delivery_method === DeliveryMethod.BOTH)
        && physician?.email
      ) {
        const emailResult = await EmailService.sendSigningLink({
          to: physician.email,
          physicianName,
          patientInitials,
          formType: req.body.form_type,
          signingUrl,
        });

        await AuditLogModel.create({
          form_submission_id: submission.id,
          action: AuditAction.EMAIL_SENT,
          actor_type: 'system',
          details: { success: emailResult.success },
        });
      }

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

/** GET /api/forms/:id/download/:type — Download original or signed PDF */
router.get('/:id/download/:type', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmissionModel.findById(req.params.id);
    if (!submission) {
      res.status(404).json({ error: 'Form not found' });
      return;
    }

    const pdfType = req.params.type;
    if (pdfType !== 'original' && pdfType !== 'signed') {
      res.status(400).json({ error: 'Invalid download type. Must be "original" or "signed".' });
      return;
    }

    let key: string;

    if (pdfType === 'signed') {
      if (!submission.signed_pdf_key) {
        res.status(404).json({ error: 'Signed PDF not yet available' });
        return;
      }
      key = submission.signed_pdf_key;
    } else {
      key = submission.original_pdf_key;
    }

    // Return a pre-signed S3 URL (expires in 5 minutes)
    const downloadUrl = S3Service.getSignedUrl(key, 300);

    await AuditLogModel.create({
      form_submission_id: submission.id,
      action: AuditAction.STAFF_DOWNLOADED,
      actor_type: 'staff',
      actor_id: req.staffUser!.sub,
      ip_address: req.ip,
      details: { pdf_type: pdfType },
    });

    res.json({ download_url: downloadUrl });
  } catch (err) {
    logger.error('Download form error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
