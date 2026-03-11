// ─── CMN Form Types ──────────────────────────────────────────────────────────

export enum FormType {
  CMS_484 = 'CMS-484',           // Oxygen
  CMS_10126 = 'CMS-10126',       // Hospital Beds
  CMS_10125 = 'CMS-10125',       // POV/Power Wheelchairs
  PRIOR_AUTH = 'PRIOR-AUTH',     // Generic prior authorization
}

export enum FormStatus {
  DRAFT = 'draft',
  PENDING_SIGNATURE = 'pending_signature',
  VIEWED = 'viewed',
  SIGNED = 'signed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum DeliveryMethod {
  FAX = 'fax',
  EMAIL = 'email',
  BOTH = 'both',
}

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface Physician {
  id: string;
  npi: string;
  first_name: string;
  last_name: string;
  fax_number: string | null;
  email: string | null;
  phone: string | null;
  practice_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  medicare_id: string | null;
  insurance_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FormSubmission {
  id: string;
  form_type: FormType;
  status: FormStatus;
  delivery_method: DeliveryMethod;

  // Relationships
  physician_id: string;
  patient_id: string;
  created_by: string; // UMS staff user id

  // PDF storage
  original_pdf_key: string;       // S3 key for uploaded PDF
  signed_pdf_key: string | null;  // S3 key for signed PDF

  // Signing link
  signing_token: string;          // unique token for the signing URL
  pin_hash: string;               // hashed PIN for physician auth
  pin_attempts: number;

  // Section B data (JSON — physician-completed clinical questions)
  section_b_data: Record<string, unknown> | null;

  // Signature
  signature_data: string | null;  // base64 signature image
  signed_at: Date | null;
  signer_ip: string | null;
  signer_user_agent: string | null;

  // Timestamps & expiry
  expires_at: Date;
  last_reminder_at: Date | null;
  reminder_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  form_submission_id: string;
  action: AuditAction;
  actor_type: 'staff' | 'physician' | 'system';
  actor_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export enum AuditAction {
  FORM_CREATED = 'form_created',
  PDF_UPLOADED = 'pdf_uploaded',
  LINK_GENERATED = 'link_generated',
  FAX_SENT = 'fax_sent',
  EMAIL_SENT = 'email_sent',
  LINK_OPENED = 'link_opened',
  PIN_VERIFIED = 'pin_verified',
  PIN_FAILED = 'pin_failed',
  SECTION_B_SAVED = 'section_b_saved',
  SIGNATURE_CAPTURED = 'signature_captured',
  FORM_SIGNED = 'form_signed',
  SIGNED_PDF_GENERATED = 'signed_pdf_generated',
  REMINDER_SENT = 'reminder_sent',
  FORM_EXPIRED = 'form_expired',
  FORM_CANCELLED = 'form_cancelled',
  FORM_VIEWED = 'form_viewed',
  STAFF_DOWNLOADED = 'staff_downloaded',
}

export interface StaffUser {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'intake';
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReminderSchedule {
  id: string;
  form_submission_id: string;
  scheduled_at: Date;
  sent_at: Date | null;
  delivery_method: DeliveryMethod;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  created_at: Date;
}

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface CreateFormRequest {
  form_type: FormType;
  delivery_method: DeliveryMethod;
  physician_id: string;
  patient_id: string;
  physician_fax?: string;
  physician_email?: string;
  reminder_days?: number[];     // e.g. [3, 7, 14]
}

export interface VerifyPinRequest {
  pin: string;
}

export interface SaveSectionBRequest {
  section_b_data: Record<string, unknown>;
}

export interface SignFormRequest {
  signature_data: string;       // base64 encoded signature image
}

export interface StaffLoginRequest {
  email: string;
  password: string;
}

// ─── JWT Payload ─────────────────────────────────────────────────────────────

export interface StaffJwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'intake';
  iat: number;
  exp: number;
}

export interface PhysicianSessionPayload {
  sub: string;             // form_submission id
  physician_id: string;
  type: 'physician_session';
  iat: number;
  exp: number;
}
