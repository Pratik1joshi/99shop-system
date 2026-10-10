/** Disposable localhost-only fresh/upgrade/browser database verification. */
import pg from 'pg';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const url = new URL(process.env.TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('An isolated localhost TEST_DATABASE_URL is required.');
fs.mkdirSync('.commerce-tmp/phase1f', { recursive: true });
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const suffix = `${Date.now()}_${process.pid}`;
const report = { started_at: new Date().toISOString(), host: url.hostname, port: url.port, checks: [] };
const run = (script, target) => {
  const result = spawnSync(process.execPath, ['--import', './tests/unit/loader-register.mjs', script], { stdio: 'inherit', env: { ...process.env,
    DATABASE_URL: target.href, ADMIN_PASSWORD: 'KmTestOnly123', E2E_CASHIER_PASSWORD: 'CashierTest123', SKIP_DB_ON_BUILD: '' } });
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
};
try {
  for (const mode of ['upgrade', 'browser']) {
    const name = `phase1f_${mode}_${suffix}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const target = new URL(url); target.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: target.href });
    await client.connect();
    try {
      if (mode === 'upgrade') {
        await client.query('CREATE TABLE schema_migrations (id SERIAL PRIMARY KEY, version TEXT UNIQUE NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        const files = fs.readdirSync('migrations').filter((f) => /^\d+.*\.sql$/.test(f) && Number(f.slice(0, 3)) <= 97).sort();
        for (const file of files) {
          await client.query('BEGIN');
          await client.query(fs.readFileSync(`migrations/${file}`, 'utf8'));
          await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file.replace(/\.sql$/, '')]);
          await client.query('COMMIT');
        }
        run('scripts/seed-postgres.mjs', target);
      }
      run('scripts/migrate.mjs', target);
      run('scripts/seed-postgres.mjs', target);
      run('scripts/seed-retail-e2e.mjs', target);
      if (mode === 'browser') run('scripts/seed-phase1f-browser.mjs', target);
      const before = (await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n;
      run('scripts/migrate.mjs', target);
      const after = (await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n;
      if (before !== after) throw new Error('Migration rerun changed applied version count');
      report.checks.push({ mode, status: 'PASS', migrations: after, database: name });
      if (mode === 'browser') fs.writeFileSync('.commerce-tmp/phase1f/browser.env', `DATABASE_URL=${target.href}\nE2E_ADMIN_PIN=KmTestOnly123\nE2E_CASHIER_PASSWORD=CashierTest123\n`);
    } finally {
      await client.end();
      if (mode === 'upgrade') await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  }
} finally {
  fs.writeFileSync('.commerce-tmp/phase1f/environment.json', JSON.stringify(report, null, 2));
  await admin.end();
}
