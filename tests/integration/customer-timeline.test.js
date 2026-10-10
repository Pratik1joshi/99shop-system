import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { getCustomerTimeline } from '../../lib/retail-customer-timeline.js';
import { GET as getJournal } from '../../app/api/admin/retail-journals/[id]/route.js';
import { AuthService } from '../../lib/auth/auth.js';
import { postJournal } from '../../lib/accounting.js';
import { ACCOUNTING_SOURCES } from '../../lib/accounting-source-registry.js';
import bcrypt from 'bcryptjs';

if (!/^\/km_test_\d+_\d+$/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Run through the isolated integration runner.');
const db = Database.getInstance();
test.after(async () => Database.close());

test('timeline paginates the merged chronology beyond old source caps without loss or duplicates', async () => {
  const customer = (await db.run("INSERT INTO customers(name,phone) VALUES ('Timeline fixture','9800011101')")).lastInsertRowid;
  for (let i = 0; i < 125; i++) {
    await db.run(`INSERT INTO loyalty_transactions(customer_id,type,points,balance_after,reason,created_at)
      VALUES (?,'ADJUSTMENT',1,?,'Recorded adjustment',?)`, [customer, i + 1, `2026-09-${String(1 + i % 25).padStart(2, '0')} 12:00:00`]);
  }
  await db.run(`INSERT INTO store_credit_transactions(customer_id,type,amount,balance_after,reason,created_at)
    VALUES (?,'ADJUSTMENT',10,10,'Recorded correction','2026-09-26 12:00:00')`, [customer]);
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const result = await getCustomerTimeline(db, customer, { page, pageSize: 30, includeApprovals: true });
    assert.equal(result.pagination.has_more, page < 5);
    all.push(...result.events);
  }
  assert.equal(all.length, 126);
  assert.equal(new Set(all.map((x) => x.key)).size, 126);
  assert.equal(all[0].event, 'Store Credit Correction');
  assert.equal(all[0].amount, 10);
  assert.ok(all.every((x) => x.href && x.id));
  assert.ok(all.slice(1).every((x) => x.event === 'Manual Loyalty Adjustment' && x.points === 1));
  for (let i = 1; i < all.length; i++) assert.ok(new Date(all[i - 1].occurred_at).getTime() >= new Date(all[i].occurred_at).getTime());
  assert.equal((await getCustomerTimeline(db, customer, { pageSize: 100000 })).events.length, 100);
  const other = (await db.run("INSERT INTO customers(name) VALUES ('No history')")).lastInsertRowid;
  assert.deepEqual((await getCustomerTimeline(db, other)).events, []);
  const exact = await getCustomerTimeline(db, customer, { sourceType: 'store_credit', sourceId: all[0].id });
  assert.equal(exact.events.length, 1);
  assert.equal(exact.events[0].key, all[0].key);
});

test('journal evidence is server protected and reads posted accounting with its source identity', async () => {
  for (const definition of Object.values(ACCOUNTING_SOURCES)) if (definition.table) {
    assert.ok(await db.get('SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name=?', ['public',definition.table]), `${definition.table} exists`);
  }
  const posted = await postJournal(db, { memo: 'Journal source fixture', source_type: 'manual', created_by: 1,
    lines: [{ code: '1010', debit: 50, credit: 0 }, { code: '3010', debit: 0, credit: 50 }] });
  const journalId = typeof posted === 'object' ? posted.id : posted;
  const params = { params: Promise.resolve({ id: String(journalId) }) };
  const request = (token) => new Request(`http://localhost/api/admin/retail-journals/${journalId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await getJournal(request(), params)).status, 401);
  const auth = new AuthService();
  const owner = await auth.authenticate('admin', 'KmTestOnly123');
  assert.equal(owner.success, true);
  const result = await getJournal(request(owner.token), params);
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
  const data = await result.json();
  assert.equal(data.source.label, 'Manual Journal');
  assert.equal(data.lines.length, 2);
  assert.equal(data.lines.reduce((n,line)=>n+Number(line.debit)-Number(line.credit),0),0);
  for (const role of ['cashier','inventory_staff','purchasing_staff','manager']) {
    await db.run('INSERT INTO users(username,password_hash,full_name,role,is_active,must_change_password) VALUES (?,?,?,?,1,0)', [`journal_${role}`,bcrypt.hashSync('TestOnly123',4),role,role]);
    const session = await auth.authenticate(`journal_${role}`,'TestOnly123');
    assert.equal((await getJournal(request(session.token),params)).status,403,role);
  }
  await db.run('INSERT INTO users(username,password_hash,full_name,role,is_active,must_change_password) VALUES (?,?,?,?,1,0)', ['journal_accountant',bcrypt.hashSync('TestOnly123',4),'Accountant','accountant']);
  const accountant = await auth.authenticate('journal_accountant','TestOnly123');
  assert.equal((await getJournal(request(accountant.token),params)).status,200);
});
