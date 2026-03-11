import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID generation
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ── Staff Users ──────────────────────────────────────────────────────────
  await knex.schema.createTable('staff_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.enum('role', ['admin', 'intake']).notNullable().defaultTo('intake');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at');
    table.timestamps(true, true);
  });

  // ── Physicians ───────────────────────────────────────────────────────────
  await knex.schema.createTable('physicians', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('npi', 10).notNullable().unique();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('fax_number', 20);
    table.string('email', 255);
    table.string('phone', 20);
    table.string('practice_name', 255);
    table.string('address_line1', 255);
    table.string('address_line2', 255);
    table.string('city', 100);
    table.string('state', 2);
    table.string('zip', 10);
    table.timestamps(true, true);

    table.index(['last_name', 'first_name']);
    table.index('npi');
  });

  // ── Patients ─────────────────────────────────────────────────────────────
  await knex.schema.createTable('patients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.date('date_of_birth').notNullable();
    table.string('medicare_id', 20);
    table.string('insurance_id', 50);
    table.string('address_line1', 255);
    table.string('city', 100);
    table.string('state', 2);
    table.string('zip', 10);
    table.timestamps(true, true);

    table.index(['last_name', 'first_name']);
  });

  // ── Form Submissions ─────────────────────────────────────────────────────
  await knex.schema.createTable('form_submissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.enum('form_type', ['CMS-484', 'CMS-10126', 'CMS-10125', 'PRIOR-AUTH']).notNullable();
    table.enum('status', [
      'draft', 'pending_signature', 'viewed', 'signed', 'expired', 'cancelled',
    ]).notNullable().defaultTo('draft');
    table.enum('delivery_method', ['fax', 'email', 'both']).notNullable();

    // Relationships
    table.uuid('physician_id').notNullable().references('id').inTable('physicians');
    table.uuid('patient_id').notNullable().references('id').inTable('patients');
    table.uuid('created_by').notNullable().references('id').inTable('staff_users');

    // PDF storage (S3 keys)
    table.string('original_pdf_key', 512).notNullable();
    table.string('signed_pdf_key', 512);

    // Signing link
    table.string('signing_token', 64).notNullable().unique();
    table.string('pin_hash', 255).notNullable();
    table.integer('pin_attempts').notNullable().defaultTo(0);

    // Section B data
    table.jsonb('section_b_data');

    // Signature
    table.text('signature_data'); // base64 signature image
    table.timestamp('signed_at');
    table.string('signer_ip', 45);
    table.string('signer_user_agent', 500);

    // Expiry & reminders
    table.timestamp('expires_at').notNullable();
    table.timestamp('last_reminder_at');
    table.integer('reminder_count').notNullable().defaultTo(0);

    table.timestamps(true, true);

    table.index('signing_token');
    table.index('status');
    table.index('expires_at');
    table.index('physician_id');
    table.index('patient_id');
    table.index('created_by');
  });

  // ── Audit Logs ───────────────────────────────────────────────────────────
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('form_submission_id').notNullable()
      .references('id').inTable('form_submissions').onDelete('CASCADE');
    table.string('action', 50).notNullable();
    table.enum('actor_type', ['staff', 'physician', 'system']).notNullable();
    table.uuid('actor_id');
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.jsonb('details');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('form_submission_id');
    table.index('action');
    table.index('created_at');
  });

  // ── Reminder Schedules ───────────────────────────────────────────────────
  await knex.schema.createTable('reminder_schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('form_submission_id').notNullable()
      .references('id').inTable('form_submissions').onDelete('CASCADE');
    table.timestamp('scheduled_at').notNullable();
    table.timestamp('sent_at');
    table.enum('delivery_method', ['fax', 'email', 'both']).notNullable();
    table.enum('status', ['pending', 'sent', 'failed', 'cancelled']).notNullable().defaultTo('pending');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('scheduled_at');
    table.index('status');
    table.index('form_submission_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reminder_schedules');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('form_submissions');
  await knex.schema.dropTableIfExists('patients');
  await knex.schema.dropTableIfExists('physicians');
  await knex.schema.dropTableIfExists('staff_users');
}
