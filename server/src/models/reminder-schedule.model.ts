import { db } from '../config/database';
import { ReminderSchedule, DeliveryMethod } from '../types';

const TABLE = 'reminder_schedules';

export const ReminderScheduleModel = {
  async create(data: {
    form_submission_id: string;
    scheduled_at: Date;
    delivery_method: DeliveryMethod;
  }): Promise<ReminderSchedule> {
    const [schedule] = await db(TABLE).insert(data).returning('*');
    return schedule;
  },

  async createBatch(entries: {
    form_submission_id: string;
    scheduled_at: Date;
    delivery_method: DeliveryMethod;
  }[]): Promise<ReminderSchedule[]> {
    return db(TABLE).insert(entries).returning('*');
  },

  async findDueReminders(): Promise<ReminderSchedule[]> {
    return db(TABLE)
      .where('status', 'pending')
      .where('scheduled_at', '<=', db.fn.now());
  },

  async markSent(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({
      status: 'sent',
      sent_at: db.fn.now(),
    });
  },

  async markFailed(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ status: 'failed' });
  },

  async cancelByFormSubmission(formSubmissionId: string): Promise<void> {
    await db(TABLE)
      .where({ form_submission_id: formSubmissionId, status: 'pending' })
      .update({ status: 'cancelled' });
  },

  async findByFormSubmission(formSubmissionId: string): Promise<ReminderSchedule[]> {
    return db(TABLE)
      .where({ form_submission_id: formSubmissionId })
      .orderBy('scheduled_at', 'asc');
  },
};
