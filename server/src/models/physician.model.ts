import { db } from '../config/database';
import { Physician } from '../types';

const TABLE = 'physicians';

export const PhysicianModel = {
  async findById(id: string): Promise<Physician | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findByNpi(npi: string): Promise<Physician | undefined> {
    return db(TABLE).where({ npi }).first();
  },

  async search(query: string, limit = 20): Promise<Physician[]> {
    return db(TABLE)
      .where('last_name', 'ilike', `%${query}%`)
      .orWhere('first_name', 'ilike', `%${query}%`)
      .orWhere('npi', 'like', `%${query}%`)
      .orWhere('practice_name', 'ilike', `%${query}%`)
      .limit(limit)
      .orderBy('last_name');
  },

  async list(page = 1, perPage = 25): Promise<{ data: Physician[]; total: number }> {
    const offset = (page - 1) * perPage;
    const [data, [{ count }]] = await Promise.all([
      db(TABLE).orderBy('last_name').limit(perPage).offset(offset),
      db(TABLE).count('id as count'),
    ]);
    return { data, total: Number(count) };
  },

  async create(data: Omit<Physician, 'id' | 'created_at' | 'updated_at'>): Promise<Physician> {
    const [physician] = await db(TABLE).insert(data).returning('*');
    return physician;
  },

  async update(id: string, data: Partial<Omit<Physician, 'id' | 'created_at' | 'updated_at'>>): Promise<Physician | undefined> {
    const [physician] = await db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*');
    return physician;
  },

  async delete(id: string): Promise<boolean> {
    const count = await db(TABLE).where({ id }).del();
    return count > 0;
  },
};
