import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '3001'), 10),

  // Database
  db: {
    host: optional('DB_HOST', 'localhost'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: optional('DB_NAME', 'dme_esign'),
    user: optional('DB_USER', 'postgres'),
    password: optional('DB_PASSWORD', 'postgres'),
    ssl: optional('DB_SSL', 'false') === 'true',
  },

  // JWT
  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
    staffExpiresIn: optional('JWT_STAFF_EXPIRES', '8h'),
    physicianSessionExpiresIn: optional('JWT_PHYSICIAN_EXPIRES', '1h'),
  },

  // AWS S3
  s3: {
    bucket: optional('S3_BUCKET', 'dme-esign-documents'),
    region: optional('AWS_REGION', 'us-east-1'),
    accessKeyId: optional('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('AWS_SECRET_ACCESS_KEY', ''),
  },

  // Signing links
  signing: {
    baseUrl: optional('SIGNING_BASE_URL', 'http://localhost:5173'),
    linkExpiryDays: parseInt(optional('SIGNING_LINK_EXPIRY_DAYS', '30'), 10),
    maxPinAttempts: parseInt(optional('MAX_PIN_ATTEMPTS', '5'), 10),
    pinLength: parseInt(optional('PIN_LENGTH', '6'), 10),
  },

  // Fax (Twilio or SRFax)
  fax: {
    provider: optional('FAX_PROVIDER', 'twilio') as 'twilio' | 'srfax',
    twilio: {
      accountSid: optional('TWILIO_ACCOUNT_SID', ''),
      authToken: optional('TWILIO_AUTH_TOKEN', ''),
      faxNumber: optional('TWILIO_FAX_NUMBER', ''),
    },
    srfax: {
      accountNumber: optional('SRFAX_ACCOUNT_NUMBER', ''),
      password: optional('SRFAX_PASSWORD', ''),
      senderFaxNumber: optional('SRFAX_SENDER_NUMBER', ''),
    },
  },

  // Email (SMTP)
  email: {
    host: optional('SMTP_HOST', 'localhost'),
    port: parseInt(optional('SMTP_PORT', '587'), 10),
    secure: optional('SMTP_SECURE', 'false') === 'true',
    user: optional('SMTP_USER', ''),
    password: optional('SMTP_PASSWORD', ''),
    from: optional('EMAIL_FROM', 'noreply@universalmedicalsupply.com'),
  },

  // Webhook
  webhook: {
    signedNotificationUrl: optional('WEBHOOK_SIGNED_URL', ''),
  },

  // Reminders
  reminders: {
    defaultDays: [3, 7, 14],
    cronSchedule: optional('REMINDER_CRON', '0 9 * * *'), // daily at 9 AM
  },

  // HIPAA session timeout (minutes)
  sessionTimeoutMinutes: parseInt(optional('SESSION_TIMEOUT_MINUTES', '15'), 10),

  // CORS
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
} as const;
