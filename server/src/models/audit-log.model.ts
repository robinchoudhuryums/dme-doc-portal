import { db } from '../config/database';
import { AuditLog, AuditAction } from '../types';

const TABLE = 'audit_logs';

export const AuditLogModel = {
  async create(data: {
    form_submission_id: string;
    action: AuditAction;
    actor_type: 'staff' | 'physician' | 'system';
    actor_id?: string;
    ip_address?: string;
    user_agent?: string;
    details?: Record<string, unknown>;
  }): Promise<AuditLog> {
    const [log] = await db(TABLE).insert(data).returning('*');
    return log;
  },

  async findByFormSubmission(formSubmissionId: string): Promise<AuditLog[]> {
    return db(TABLE)
      .where({ form_submission_id: formSubmissionId })
      .orderBy('created_at', 'asc');
  },

  async findByAction(action: AuditAction, limit = 100): Promise<AuditLog[]> {
    return db(TABLE)
      .where({ action })
      .orderBy('created_at', 'desc')
      .limit(limit);
  },
};
