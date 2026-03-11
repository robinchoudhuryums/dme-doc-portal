import { db } from '../config/database';
import { Patient } from '../types';

const TABLE = 'patients';

export const PatientModel = {
  async findById(id: string): Promise<Patient | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async search(query: string, limit = 20): Promise<Patient[]> {
    return db(TABLE)
      .where('last_name', 'ilike', `%${query}%`)
      .orWhere('first_name', 'ilike', `%${query}%`)
      .orWhere('medicare_id', 'like', `%${query}%`)
      .limit(limit)
      .orderBy('last_name');
  },

  async create(data: Omit<Patient, 'id' | 'created_at' | 'updated_at'>): Promise<Patient> {
    const [patient] = await db(TABLE).insert(data).returning('*');
    return patient;
  },

  async update(id: string, data: Partial<Omit<Patient, 'id' | 'created_at' | 'updated_at'>>): Promise<Patient | undefined> {
    const [patient] = await db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*');
    return patient;
  },
};
