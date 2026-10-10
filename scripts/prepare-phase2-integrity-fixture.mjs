/** Fresh, fully journaled local fixture. Never resets an existing database. */
import fs from 'node:fs';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
const control = new URL(process.env.TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(control.hostname)) throw new Error('Local test PostgreSQL required');
const admin = new pg.Client({ connectionString: control.href });
await admin.connect();
try {
  const name = `phase1f_browser_${Date.now()}_${process.pid}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const target = new URL(control); target.pathname = `/${name}`;
  const env = { ...process.env, DATABASE_URL: target.href, ADMIN_PASSWORD: 'KmTestOnly123', E2E_CASHIER_PASSWORD: 'CashierTest123', SKIP_DB_ON_BUILD: '' };
  for (const script of ['scripts/migrate.mjs', 'scripts/seed-postgres.mjs', 'scripts/seed-retail-e2e.mjs', 'scripts/seed-phase1f-browser.mjs', 'scripts/seed-phase1g-browser.mjs']) {
    const result = spawnSync(process.execPath, ['--import', './tests/unit/loader-register.mjs', script], { env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${script} failed`);
  }
  fs.mkdirSync('.commerce-tmp/phase2', { recursive: true });
  fs.writeFileSync('.commerce-tmp/phase2/browser.env', `DATABASE_URL=${target.href}\nE2E_ADMIN_PIN=KmTestOnly123\nE2E_CASHIER_PASSWORD=CashierTest123\n`);
} finally { await admin.end(); }
