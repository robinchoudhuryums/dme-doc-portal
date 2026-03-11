import { config } from '../config';
import logger from '../utils/logger';

/**
 * Webhook notification service. Posts events to a configured URL
 * when forms are signed (or other important events).
 */
export const NotificationService = {
  /**
   * Send a webhook notification that a form has been signed.
   */
  async notifyFormSigned(payload: {
    form_id: string;
    form_type: string;
    physician_id: string;
    patient_id: string;
    signed_at: string;
    signed_pdf_key: string;
  }): Promise<void> {
    const url = config.webhook.signedNotificationUrl;
    if (!url) {
      logger.debug('No webhook URL configured, skipping notification');
      return;
    }

    const body = JSON.stringify({
      event: 'form.signed',
      timestamp: new Date().toISOString(),
      data: payload,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'ums-esign-portal',
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (!response.ok) {
        logger.warn('Webhook returned non-OK status', {
          status: response.status,
          formId: payload.form_id,
        });
      } else {
        logger.info('Webhook notification sent', { formId: payload.form_id });
      }
    } catch (err) {
      logger.error('Webhook notification failed', {
        error: (err as Error).message,
        formId: payload.form_id,
      });
      // Don't throw — webhook failure shouldn't block the signing flow
    }
  },

  /**
   * Send a webhook for form expiration events.
   */
  async notifyFormExpired(payload: {
    form_id: string;
    form_type: string;
    physician_id: string;
    expired_at: string;
  }): Promise<void> {
    const url = config.webhook.signedNotificationUrl;
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'ums-esign-portal',
        },
        body: JSON.stringify({
          event: 'form.expired',
          timestamp: new Date().toISOString(),
          data: payload,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      logger.error('Expiry webhook failed', { error: (err as Error).message });
    }
  },
};
