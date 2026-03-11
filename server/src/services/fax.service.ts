import { config } from '../config';
import logger from '../utils/logger';

/**
 * Fax delivery service. Supports Twilio Programmable Fax and SRFax.
 * For dev/testing, logs to console instead of sending.
 */
export const FaxService = {
  async sendFax(options: {
    to: string;
    pdfBuffer: Buffer;
    subject?: string;
  }): Promise<{ success: boolean; faxId?: string; error?: string }> {
    const { to, pdfBuffer, subject } = options;

    if (config.env === 'development') {
      logger.info('DEV: Fax would be sent', { to, subject, pdfSize: pdfBuffer.length });
      return { success: true, faxId: `dev-fax-${Date.now()}` };
    }

    if (config.fax.provider === 'twilio') {
      return sendViaTwilio(to, pdfBuffer);
    } else {
      return sendViaSRFax(to, pdfBuffer);
    }
  },
};

async function sendViaTwilio(to: string, pdfBuffer: Buffer): Promise<{ success: boolean; faxId?: string; error?: string }> {
  try {
    // Twilio requires the PDF to be hosted at a URL.
    // In production, upload to S3 with a short-lived pre-signed URL.
    const twilio = await import('twilio' as string);
    const client = twilio.default(config.fax.twilio.accountSid, config.fax.twilio.authToken);

    // Upload PDF to a temp URL first (via S3 signed URL or Twilio Media)
    // For now, we'll document that the caller should provide a URL
    // This is a simplified implementation
    const fax = await client.fax.v1.faxes.create({
      from: config.fax.twilio.faxNumber,
      to,
      mediaUrl: '', // caller must set this to a pre-signed S3 URL
    });

    logger.info('Twilio fax sent', { faxSid: fax.sid });
    return { success: true, faxId: fax.sid };
  } catch (err) {
    const message = (err as Error).message;
    logger.error('Twilio fax failed', { error: message });
    return { success: false, error: message };
  }
}

async function sendViaSRFax(to: string, _pdfBuffer: Buffer): Promise<{ success: boolean; faxId?: string; error?: string }> {
  try {
    // SRFax uses a REST API with base64 PDF payload
    const https = await import('https');
    const payload = JSON.stringify({
      action: 'Queue_Fax',
      access_id: config.fax.srfax.accountNumber,
      access_pwd: config.fax.srfax.password,
      sCallerID: config.fax.srfax.senderFaxNumber,
      sSenderEmail: config.email.from,
      sFaxType: 'SINGLE',
      sToFaxNumber: to,
      sFileName_1: 'cover-sheet.pdf',
      sFileContent_1: _pdfBuffer.toString('base64'),
    });

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'www.srfax.com',
          path: '/SRF_SecWebSvc.php',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.Status === 'Success') {
                logger.info('SRFax sent', { faxId: result.Result });
                resolve({ success: true, faxId: String(result.Result) });
              } else {
                logger.error('SRFax failed', { result: data });
                resolve({ success: false, error: result.Result });
              }
            } catch {
              resolve({ success: false, error: 'Invalid SRFax response' });
            }
          });
        },
      );
      req.on('error', (err: Error) => resolve({ success: false, error: err.message }));
      req.write(payload);
      req.end();
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.error('SRFax error', { error: message });
    return { success: false, error: message };
  }
}
