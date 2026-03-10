import { pool } from './pool';
import logger from '../logger';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';

async function seed(): Promise<void> {
  // Refus d'exécution en production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed désactivé en production. Utilisez des migrations à la place.');
  }

  logger.info('Seeding database...');

  // Idempotent: skip if data already exists
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count, 10) > 0) {
    logger.info('Database already seeded, skipping.');
    return;
  }

  // ── Admin user from environment variables ───────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL    ?? 'admin@example.com';
  const adminUsername = process.env.ADMIN_USERNAME ?? 'Admin';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123456';
  const adminAvatar   = adminUsername.trim().split(' ')
    .map(n => n[0]?.toUpperCase() ?? '').join('').slice(0, 2);
  const adminHash = await bcrypt.hash(adminPassword, config.bcryptRounds);

  await pool.query(
    `INSERT INTO users (id, name, avatar, color, email, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,$6,'admin') ON CONFLICT (email) DO NOTHING`,
    [randomUUID(), adminUsername.trim(), adminAvatar, '#0052CC', adminEmail, adminHash]
  );
  logger.info('Admin user created');

  logger.info('Database seeded successfully');
}

seed()
  .then(() => pool.end())
  .catch((err) => { logger.error(err); process.exit(1); });
