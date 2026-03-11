/**
 * Seed script — creates an initial admin user and sample data for development.
 *
 * Usage: cd server && npx tsx src/scripts/seed.ts
 */

import { db } from '../config/database';
import { hashPassword } from '../utils/crypto';

async function seed() {
  console.log('Seeding database...');

  // ── Admin User ────────────────────────────────────────────────────────
  const adminPassword = await hashPassword('admin123');
  const [admin] = await db('staff_users')
    .insert({
      email: 'admin@ums.com',
      password_hash: adminPassword,
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
    })
    .onConflict('email')
    .ignore()
    .returning('*');

  if (admin) {
    console.log(`  Created admin user: admin@ums.com (password: admin123)`);
  } else {
    console.log('  Admin user already exists, skipping');
  }

  // ── Intake Staff User ─────────────────────────────────────────────────
  const intakePassword = await hashPassword('intake123');
  const [intake] = await db('staff_users')
    .insert({
      email: 'intake@ums.com',
      password_hash: intakePassword,
      first_name: 'Sarah',
      last_name: 'Johnson',
      role: 'intake',
    })
    .onConflict('email')
    .ignore()
    .returning('*');

  if (intake) {
    console.log(`  Created intake user: intake@ums.com (password: intake123)`);
  } else {
    console.log('  Intake user already exists, skipping');
  }

  // ── Sample Physicians ─────────────────────────────────────────────────
  const physicians = [
    {
      npi: '1234567890',
      first_name: 'James',
      last_name: 'Wilson',
      fax_number: '+15551234567',
      email: 'wilson@example.com',
      phone: '+15551234568',
      practice_name: 'Wilson Medical Associates',
      city: 'Houston',
      state: 'TX',
      zip: '77001',
    },
    {
      npi: '0987654321',
      first_name: 'Lisa',
      last_name: 'Cuddy',
      fax_number: '+15559876543',
      email: 'cuddy@example.com',
      practice_name: 'Princeton-Plainsboro Teaching Hospital',
      city: 'Princeton',
      state: 'NJ',
      zip: '08540',
    },
    {
      npi: '1122334455',
      first_name: 'Robert',
      last_name: 'Chase',
      fax_number: '+15551122334',
      email: 'chase@example.com',
      practice_name: 'Chase Pulmonology',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
    },
  ];

  for (const doc of physicians) {
    const [created] = await db('physicians')
      .insert(doc)
      .onConflict('npi')
      .ignore()
      .returning('*');
    if (created) {
      console.log(`  Created physician: Dr. ${doc.first_name} ${doc.last_name} (NPI: ${doc.npi})`);
    }
  }

  // ── Sample Patients ───────────────────────────────────────────────────
  const patients = [
    {
      first_name: 'John',
      last_name: 'Smith',
      date_of_birth: '1945-03-15',
      medicare_id: '1EG4-TE5-MK72',
      city: 'Houston',
      state: 'TX',
      zip: '77002',
    },
    {
      first_name: 'Mary',
      last_name: 'Johnson',
      date_of_birth: '1952-08-22',
      medicare_id: '2AB7-XY8-PQ93',
      city: 'Princeton',
      state: 'NJ',
      zip: '08541',
    },
    {
      first_name: 'Robert',
      last_name: 'Williams',
      date_of_birth: '1940-11-07',
      insurance_id: 'BCBS-FL-887234',
      city: 'Miami',
      state: 'FL',
      zip: '33102',
    },
  ];

  for (const patient of patients) {
    await db('patients').insert(patient).returning('*');
    console.log(`  Created patient: ${patient.first_name} ${patient.last_name}`);
  }

  console.log('\nSeed complete!');
  console.log('\nLogin credentials:');
  console.log('  Admin:  admin@ums.com / admin123');
  console.log('  Intake: intake@ums.com / intake123');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => db.destroy());
