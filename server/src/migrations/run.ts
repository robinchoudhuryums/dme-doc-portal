import { db } from '../config/database';
import { up } from './001_initial_schema';

async function runMigrations() {
  console.log('Running migrations...');
  try {
    // Check if the schema already exists (idempotent deploys)
    const exists = await db.schema.hasTable('staff_users');
    if (exists) {
      console.log('Tables already exist, skipping initial migration');
    } else {
      await up(db);
      console.log('Migrations completed successfully');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();
