import knex, { Knex } from 'knex';
import { config } from './index';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: '../migrations',
    tableName: 'knex_migrations',
  },
};

export const db = knex(knexConfig);

export async function testConnection(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    console.log('Database connection established');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

export default db;
