export enum FormType {
  CMS_484 = 'CMS-484',
  CMS_10126 = 'CMS-10126',
  CMS_10125 = 'CMS-10125',
  PRIOR_AUTH = 'PRIOR-AUTH',
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

export interface FormSubmission {
  id: string;
  form_type: FormType;
  status: FormStatus;
  delivery_method: DeliveryMethod;
  physician_id: string;
  patient_id: string;
  signing_token: string;
  expires_at: string;
  signed_at: string | null;
  reminder_count: number;
  created_at: string;
  updated_at: string;
  physician_name?: string;
  patient_name?: string;
}

export interface Physician {
  id: string;
  npi: string;
  first_name: string;
  last_name: string;
  fax_number: string | null;
  email: string | null;
  phone: string | null;
  practice_name: string | null;
}

export interface DashboardStats {
  total: number;
  draft: number;
  pending_signature: number;
  viewed: number;
  signed: number;
  expired: number;
  cancelled: number;
}

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  [FormType.CMS_484]: 'CMS-484 (Oxygen)',
  [FormType.CMS_10126]: 'CMS-10126 (Hospital Beds)',
  [FormType.CMS_10125]: 'CMS-10125 (POV/Wheelchairs)',
  [FormType.PRIOR_AUTH]: 'Prior Authorization',
};

export const STATUS_LABELS: Record<FormStatus, string> = {
  [FormStatus.DRAFT]: 'Draft',
  [FormStatus.PENDING_SIGNATURE]: 'Pending',
  [FormStatus.VIEWED]: 'Viewed',
  [FormStatus.SIGNED]: 'Signed',
  [FormStatus.EXPIRED]: 'Expired',
  [FormStatus.CANCELLED]: 'Cancelled',
};

export function statusBadgeClass(status: FormStatus): string {
  const map: Record<FormStatus, string> = {
    [FormStatus.DRAFT]: 'badge',
    [FormStatus.PENDING_SIGNATURE]: 'badge badge-pending',
    [FormStatus.VIEWED]: 'badge badge-viewed',
    [FormStatus.SIGNED]: 'badge badge-signed',
    [FormStatus.EXPIRED]: 'badge badge-expired',
    [FormStatus.CANCELLED]: 'badge badge-cancelled',
  };
  return map[status] || 'badge';
}
