import cron from 'node-cron';
import QRCode from 'qrcode';
import { config } from '../config';
import { FormSubmissionModel } from '../models/form-submission.model';
import { ReminderScheduleModel } from '../models/reminder-schedule.model';
import { AuditLogModel } from '../models/audit-log.model';
import { PhysicianModel } from '../models/physician.model';
import { PatientModel } from '../models/patient.model';
import { FaxService } from './fax.service';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';
import { NotificationService } from './notification.service';
import { AuditAction, FormStatus, DeliveryMethod } from '../types';
import { safeInitials } from '../utils/helpers';
import logger from '../utils/logger';

export const ReminderService = {
  /**
   * Start the reminder cron job. Runs at the configured schedule (default: daily at 9 AM).
   */
  start(): void {
    logger.info('Reminder cron starting', { schedule: config.reminders.cronSchedule });

    cron.schedule(config.reminders.cronSchedule, async () => {
      logger.info('Running reminder job');
      try {
        await this.processExpiredForms();
        await this.processDueReminders();
      } catch (err) {
        logger.error('Reminder job failed', { error: (err as Error).message });
      }
    });
  },

  /**
   * Mark expired forms and send webhook notifications.
   */
  async processExpiredForms(): Promise<void> {
    const expired = await FormSubmissionModel.findExpired();
    logger.info(`Found ${expired.length} expired forms`);

    for (const form of expired) {
      try {
        await FormSubmissionModel.updateStatus(form.id, FormStatus.EXPIRED);
        await ReminderScheduleModel.cancelByFormSubmission(form.id);

        await AuditLogModel.create({
          form_submission_id: form.id,
          action: AuditAction.FORM_EXPIRED,
          actor_type: 'system',
          details: { expired_at: new Date().toISOString() },
        });

        await NotificationService.notifyFormExpired({
          form_id: form.id,
          form_type: form.form_type,
          physician_id: form.physician_id,
          expired_at: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('Failed to process expired form', {
          formId: form.id,
          error: (err as Error).message,
        });
      }
    }
  },

  /**
   * Process due reminders — send fax/email to physicians.
   */
  async processDueReminders(): Promise<void> {
    const dueReminders = await ReminderScheduleModel.findDueReminders();
    logger.info(`Found ${dueReminders.length} due reminders`);

    for (const reminder of dueReminders) {
      try {
        const form = await FormSubmissionModel.findById(reminder.form_submission_id);
        if (!form || form.status === FormStatus.SIGNED || form.status === FormStatus.CANCELLED || form.status === FormStatus.EXPIRED) {
          await ReminderScheduleModel.markSent(reminder.id);
          continue;
        }

        const physician = await PhysicianModel.findById(form.physician_id);
        const patient = await PatientModel.findById(form.patient_id);
        if (!physician || !patient) {
          await ReminderScheduleModel.markFailed(reminder.id);
          continue;
        }

        const signingUrl = `${config.signing.baseUrl}/sign/${form.signing_token}`;
        const patientInitials = safeInitials(patient.first_name, patient.last_name);
        const physicianName = `${physician.first_name} ${physician.last_name}`;
        const daysAgo = Math.round((Date.now() - new Date(form.created_at).getTime()) / (24 * 60 * 60 * 1000));

        let sent = false;

        // Send via configured delivery method
        if (
          (reminder.delivery_method === DeliveryMethod.FAX || reminder.delivery_method === DeliveryMethod.BOTH)
          && physician.fax_number
        ) {
          const qrCodeDataUrl = await QRCode.toDataURL(signingUrl, { width: 200, margin: 1 });
          const coverPdf = await PdfService.generateCoverSheet({
            physicianName,
            patientInitials,
            formType: form.form_type,
            signingUrl,
            qrCodeDataUrl,
          });

          const faxResult = await FaxService.sendFax({
            to: physician.fax_number,
            pdfBuffer: coverPdf,
            subject: `REMINDER: CMN ${form.form_type} — Patient ${patientInitials}`,
          });
          sent = sent || faxResult.success;
        }

        if (
          (reminder.delivery_method === DeliveryMethod.EMAIL || reminder.delivery_method === DeliveryMethod.BOTH)
          && physician.email
        ) {
          const emailResult = await EmailService.sendReminder({
            to: physician.email,
            physicianName,
            patientInitials,
            formType: form.form_type,
            signingUrl,
            daysAgo,
          });
          sent = sent || emailResult.success;
        }

        if (sent) {
          await ReminderScheduleModel.markSent(reminder.id);
          await FormSubmissionModel.updateStatus(form.id, form.status); // update updated_at
          await AuditLogModel.create({
            form_submission_id: form.id,
            action: AuditAction.REMINDER_SENT,
            actor_type: 'system',
            details: { delivery_method: reminder.delivery_method, days_ago: daysAgo },
          });
          logger.info('Reminder sent', { formId: form.id, daysAgo });
        } else {
          await ReminderScheduleModel.markFailed(reminder.id);
          logger.warn('Reminder delivery failed', { formId: form.id });
        }
      } catch (err) {
        logger.error('Failed to process reminder', {
          reminderId: reminder.id,
          error: (err as Error).message,
        });
        await ReminderScheduleModel.markFailed(reminder.id);
      }
    }
  },
};
