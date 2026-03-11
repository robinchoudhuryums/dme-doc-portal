import { db } from '../config/database';
import { FormSubmission, FormStatus } from '../types';

const TABLE = 'form_submissions';

export const FormSubmissionModel = {
  async findById(id: string): Promise<FormSubmission | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findByToken(signingToken: string): Promise<FormSubmission | undefined> {
    return db(TABLE).where({ signing_token: signingToken }).first();
  },

  async create(data: Omit<FormSubmission, 'id' | 'created_at' | 'updated_at' | 'pin_attempts' | 'reminder_count' | 'signed_pdf_key' | 'section_b_data' | 'signature_data' | 'signed_at' | 'signer_ip' | 'signer_user_agent' | 'last_reminder_at'>): Promise<FormSubmission> {
    const [submission] = await db(TABLE).insert(data).returning('*');
    return submission;
  },

  async updateStatus(id: string, status: FormStatus): Promise<FormSubmission | undefined> {
    const [submission] = await db(TABLE)
      .where({ id })
      .update({ status, updated_at: db.fn.now() })
      .returning('*');
    return submission;
  },

  async saveSectionB(id: string, sectionBData: Record<string, unknown>): Promise<FormSubmission | undefined> {
    const [submission] = await db(TABLE)
      .where({ id })
      .update({
        section_b_data: JSON.stringify(sectionBData),
        updated_at: db.fn.now(),
      })
      .returning('*');
    return submission;
  },

  async recordSignature(
    id: string,
    data: {
      signature_data: string;
      signed_pdf_key: string;
      signer_ip: string;
      signer_user_agent: string;
    },
  ): Promise<FormSubmission | undefined> {
    const [submission] = await db(TABLE)
      .where({ id })
      .update({
        ...data,
        status: FormStatus.SIGNED,
        signed_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
      .returning('*');
    return submission;
  },

  async incrementPinAttempts(id: string): Promise<number> {
    const [result] = await db(TABLE)
      .where({ id })
      .increment('pin_attempts', 1)
      .returning('pin_attempts');
    return result.pin_attempts;
  },

  async resetPinAttempts(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ pin_attempts: 0 });
  },

  /** List forms for the staff dashboard with physician and patient names. */
  async listForDashboard(filters: {
    status?: FormStatus;
    physician_id?: string;
    created_by?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ data: (FormSubmission & { physician_name: string; patient_name: string })[]; total: number }> {
    const page = filters.page || 1;
    const perPage = filters.perPage || 25;
    const offset = (page - 1) * perPage;

    let query = db(TABLE)
      .select(
        `${TABLE}.*`,
        db.raw("physicians.first_name || ' ' || physicians.last_name as physician_name"),
        db.raw("patients.first_name || ' ' || patients.last_name as patient_name"),
      )
      .join('physicians', `${TABLE}.physician_id`, 'physicians.id')
      .join('patients', `${TABLE}.patient_id`, 'patients.id');

    if (filters.status) query = query.where(`${TABLE}.status`, filters.status);
    if (filters.physician_id) query = query.where(`${TABLE}.physician_id`, filters.physician_id);
    if (filters.created_by) query = query.where(`${TABLE}.created_by`, filters.created_by);

    const countQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const dataQuery = query.orderBy(`${TABLE}.created_at`, 'desc').limit(perPage).offset(offset);

    const [data, countResult] = await Promise.all([dataQuery, countQuery]);
    return { data, total: Number((countResult as any)?.count || 0) };
  },

  /** Find forms that are pending and past their expiry date. */
  async findExpired(): Promise<FormSubmission[]> {
    return db(TABLE)
      .whereIn('status', [FormStatus.PENDING_SIGNATURE, FormStatus.VIEWED])
      .where('expires_at', '<', db.fn.now());
  },

  /** Find forms needing reminders. */
  async findNeedingReminders(): Promise<FormSubmission[]> {
    return db(TABLE)
      .whereIn('status', [FormStatus.PENDING_SIGNATURE, FormStatus.VIEWED])
      .where('expires_at', '>', db.fn.now());
  },

  /** Dashboard stats for UMS staff. */
  async getStats(): Promise<Record<string, number>> {
    const rows = await db(TABLE)
      .select('status')
      .count('id as count')
      .groupBy('status');

    const stats: Record<string, number> = {
      total: 0,
      draft: 0,
      pending_signature: 0,
      viewed: 0,
      signed: 0,
      expired: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      const count = Number((row as any).count);
      stats[row.status as string] = count;
      stats.total += count;
    }

    return stats;
  },
};
