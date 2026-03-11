import { db } from '../config/database';
import { StaffUser } from '../types';

const TABLE = 'staff_users';

export const StaffUserModel = {
  async findById(id: string): Promise<StaffUser | undefined> {
    return db(TABLE).where({ id }).first();
  },

  async findByEmail(email: string): Promise<StaffUser | undefined> {
    return db(TABLE).where({ email: email.toLowerCase() }).first();
  },

  async create(data: Omit<StaffUser, 'id' | 'created_at' | 'updated_at' | 'last_login_at' | 'is_active'>): Promise<StaffUser> {
    const [user] = await db(TABLE)
      .insert({ ...data, email: data.email.toLowerCase() })
      .returning('*');
    return user;
  },

  async updateLastLogin(id: string): Promise<void> {
    await db(TABLE).where({ id }).update({ last_login_at: db.fn.now() });
  },

  async list(): Promise<Omit<StaffUser, 'password_hash'>[]> {
    return db(TABLE)
      .select('id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at')
      .orderBy('last_name');
  },

  async setActive(id: string, isActive: boolean): Promise<void> {
    await db(TABLE).where({ id }).update({ is_active: isActive, updated_at: db.fn.now() });
  },
};
