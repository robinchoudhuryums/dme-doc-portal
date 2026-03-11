import { db } from '../config/database';
import { down } from './001_initial_schema';

async function rollback() {
  console.log('Rolling back migrations...');
  try {
    await down(db);
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

rollback();
