import { db } from '../config/database';
import { up } from './001_initial_schema';

async function runMigrations() {
  console.log('Running migrations...');
  try {
    await up(db);
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();
