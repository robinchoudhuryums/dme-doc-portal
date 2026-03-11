import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: config.email.user
    ? { user: config.email.user, pass: config.email.password }
    : undefined,
});

export const EmailService = {
  /**
   * Send the signing link to a physician's office via email.
   */
  async sendSigningLink(options: {
    to: string;
    physicianName: string;
    patientInitials: string;
    formType: string;
    signingUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { to, physicianName, patientInitials, formType, signingUrl } = options;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a56db; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">Universal Medical Supply</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">Physician E-Sign Request</p>
        </div>

        <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <p>Dear Dr. ${physicianName},</p>

          <p>Universal Medical Supply has prepared a <strong>${formType}</strong> form
          for patient <strong>${patientInitials}</strong> that requires your review and signature.</p>

          <p>Please click the button below to review and electronically sign the document:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="background: #1a56db; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Review & Sign Document
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280;">
            A PIN will be provided separately for identity verification.
            This link will expire in 30 days.
          </p>

          <p style="font-size: 14px; color: #6b7280;">
            If you cannot click the button, copy and paste this URL into your browser:<br>
            <a href="${signingUrl}" style="color: #1a56db; word-break: break-all;">${signingUrl}</a>
          </p>
        </div>

        <div style="padding: 15px; text-align: center; font-size: 11px; color: #9ca3af; background: #f3f4f6; border: 1px solid #e5e7eb; border-top: none;">
          <p><strong>CONFIDENTIALITY NOTICE:</strong> This email contains protected health information (PHI)
          intended only for the named recipient. If received in error, please notify the sender
          immediately and delete this email.</p>
          <p>Universal Medical Supply | (800) 555-0123 | intake@universalmedicalsupply.com</p>
        </div>
      </div>
    `;

    try {
      if (config.env === 'development') {
        logger.info('DEV: Email would be sent', { to, formType });
        return { success: true };
      }

      await transporter.sendMail({
        from: config.email.from,
        to,
        subject: `UMS: CMN Form (${formType}) Ready for Signature — Patient ${patientInitials}`,
        html,
      });

      logger.info('Signing link email sent', { to: to.substring(0, 3) + '***' });
      return { success: true };
    } catch (err) {
      const message = (err as Error).message;
      logger.error('Email send failed', { error: message });
      return { success: false, error: message };
    }
  },

  /**
   * Send a reminder email to the physician.
   */
  async sendReminder(options: {
    to: string;
    physicianName: string;
    patientInitials: string;
    formType: string;
    signingUrl: string;
    daysAgo: number;
  }): Promise<{ success: boolean; error?: string }> {
    const { to, physicianName, patientInitials, formType, signingUrl, daysAgo } = options;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #d97706; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px;">Universal Medical Supply</h1>
          <p style="margin: 5px 0 0;">Reminder: Document Awaiting Signature</p>
        </div>

        <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <p>Dear Dr. ${physicianName},</p>

          <p>This is a friendly reminder that a <strong>${formType}</strong> form
          for patient <strong>${patientInitials}</strong> was sent ${daysAgo} day(s) ago
          and is still awaiting your signature.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="background: #1a56db; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Review & Sign Now
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280;">
            If you have already signed this document, please disregard this reminder.
          </p>
        </div>

        <div style="padding: 15px; text-align: center; font-size: 11px; color: #9ca3af; background: #f3f4f6; border: 1px solid #e5e7eb; border-top: none;">
          <p><strong>CONFIDENTIALITY NOTICE:</strong> This email contains protected health information (PHI)
          intended only for the named recipient.</p>
        </div>
      </div>
    `;

    try {
      if (config.env === 'development') {
        logger.info('DEV: Reminder email would be sent', { to, formType, daysAgo });
        return { success: true };
      }

      await transporter.sendMail({
        from: config.email.from,
        to,
        subject: `REMINDER: CMN Form (${formType}) Awaiting Signature — Patient ${patientInitials}`,
        html,
      });

      logger.info('Reminder email sent', { to: to.substring(0, 3) + '***' });
      return { success: true };
    } catch (err) {
      const message = (err as Error).message;
      logger.error('Reminder email failed', { error: message });
      return { success: false, error: message };
    }
  },

  /**
   * Notify UMS staff that a form has been signed.
   */
  async notifyStaffFormSigned(options: {
    staffEmail: string;
    physicianName: string;
    patientInitials: string;
    formType: string;
    formId: string;
    signedAt: string;
  }): Promise<void> {
    const { staffEmail, physicianName, patientInitials, formType, formId, signedAt } = options;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #059669;">Form Signed Successfully</h2>
        <p>A CMN form has been signed electronically:</p>
        <ul>
          <li><strong>Form Type:</strong> ${formType}</li>
          <li><strong>Physician:</strong> Dr. ${physicianName}</li>
          <li><strong>Patient:</strong> ${patientInitials}</li>
          <li><strong>Signed:</strong> ${signedAt}</li>
          <li><strong>Form ID:</strong> ${formId}</li>
        </ul>
        <p>Log in to the portal to download the signed document.</p>
      </div>
    `;

    try {
      if (config.env === 'development') {
        logger.info('DEV: Staff notification would be sent', { staffEmail, formId });
        return;
      }

      await transporter.sendMail({
        from: config.email.from,
        to: staffEmail,
        subject: `CMN Form Signed — Dr. ${physicianName} — ${formType}`,
        html,
      });
    } catch (err) {
      logger.error('Staff notification email failed', { error: (err as Error).message });
    }
  },
};
