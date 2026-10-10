import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
const url = new URL(process.env.TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Isolated local PostgreSQL required');
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const checks = [];
try {
  for (const mode of ['fresh', 'upgrade']) {
    const name = `phase2_migration_${mode}_${Date.now()}_${process.pid}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const target = new URL(url); target.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: target.href }); await client.connect();
    try {
      const files = fs.readdirSync('migrations').filter(f => /^\d+.*\.sql$/.test(f)).sort();
      for (const file of files.filter(f => Number(f.slice(0, 3)) <= 101)) await client.query(fs.readFileSync(`migrations/${file}`, 'utf8'));
      let baseline;
      if (mode === 'upgrade') baseline = (await client.query(`INSERT INTO customers(name,phone,notes) VALUES ('Preserve customer','9800000102','Existing evidence') RETURNING *`)).rows[0];
      const migration = fs.readFileSync('migrations/102_serial_return_events.sql', 'utf8');
      await client.query(migration); await client.query(migration);
      assert.equal((await client.query('SELECT COUNT(*)::int n FROM retail_return_serial_events')).rows[0].n, 0);
      if (baseline) assert.deepEqual((await client.query('SELECT * FROM customers WHERE id=$1', [baseline.id])).rows[0], baseline);
      const constraints = (await client.query(`SELECT contype FROM pg_constraint WHERE conrelid='retail_return_serial_events'::regclass`)).rows.map(r => r.contype).sort();
      assert.deepEqual(constraints, ['f', 'f', 'p', 'u']);
      checks.push({ mode, status: 'PASS', migration: '102', rerun: 'PASS', historical_backfill: false, customer_preserved: !!baseline });
    } finally { await client.end(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  }
} finally {
  fs.mkdirSync('.commerce-tmp/phase2', { recursive: true });
  fs.writeFileSync('.commerce-tmp/phase2/migrations.json', JSON.stringify({ checks }, null, 2));
  await admin.end();
}
console.log(JSON.stringify(checks));
