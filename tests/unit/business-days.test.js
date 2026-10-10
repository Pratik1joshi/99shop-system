/**
 * Business Day Opening & Closing lifecycle.
 *
 * These tests run as one ordered story against a single isolated sqlite file
 * (business_days -> business_day_sessions -> journals) because the feature is
 * inherently stateful: a session can't reopen before it's closed, a next day
 * can't start before the current one exists, etc. Each `test()` block still
 * asserts one spec behaviour; read top-to-bottom for the full lifecycle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database, { PosDatabase } from '../../lib/db/index.js';
import { getNepaliDateString } from '../../lib/time-utils.js';
import { postJournal } from '../../lib/accounting.js';
import { reverseJournal } from '../../lib/accounting-corrections.js';
import { AuthService } from '../../lib/auth/auth.js';
import { closingReconciliation } from '../../lib/summary-report.js';
import {
  openBusinessDay,
  closeBusinessDay,
  businessDayContext,
  businessDaySummary,
  businessDayDetail,
  currentBusinessDayId,
  isStaleBusinessDay,
  isStaleAcknowledged,
  closingBlockers,
} from '../../lib/business-days.js';

const dbPath = path.join(os.tmpdir(), `business-days-test-${process.pid}-${Date.now()}.db`);
const usePostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '');
const db = usePostgres ? Database.getInstance() : new PosDatabase(dbPath);

if (usePostgres && !(await db.get(`SELECT id FROM users WHERE id=2`))) {
  await db.run(`INSERT INTO users (id,username,password_hash,full_name,role,is_active) VALUES (2,'phase05-cashier','test-only','Cashier One','cashier',1)`);
}

test.after(async () => {
  try { await db.close(); } catch { /* already closed */ }
  if (!usePostgres) {
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* already gone */ }
    }
  }
});

const admin = { id: 1, full_name: 'Admin One', role: 'admin' };
const cashier = { id: 2, full_name: 'Cashier One', role: 'cashier' };
const hasPermission = AuthService.prototype.hasPermission.bind({});

const today = getNepaliDateString();
function addDaysStr(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00+05:45`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(d);
}
const tomorrow = addDaysStr(today, 1);
const yesterday = addDaysStr(today, -1);
const twoDaysAgo = addDaysStr(today, -2);

let saleSeq = 1;
async function postCashSale(amount, businessDayId, drawerId) {
  await postJournal(db, {
    memo: 'Test cash sale',
    source_type: 'retail_sale',
    source_id: saleSeq++,
    business_day_id: businessDayId,
    lines: [
      { code: '1010', debit: amount, credit: 0, drawer_id: drawerId },
      { code: '4010', debit: 0, credit: amount },
    ],
  });
}

async function catchError(promise) {
  try { await promise; return null; } catch (error) { return error; }
}

/* ------------------------------------------------------------ opening: mode A */

let day1Id;
let drawer1Id;

test('first business-day opening creates a business_days row and its first store session', async () => {
  const day = await openBusinessDay(db, { business_date: today, opening_cash: 5000, opening_note: 'Day 1' }, admin);
  assert.equal(day.status, 'open');
  assert.equal(day.business_date, today);
  assert.equal(day.active_session.session_number, 1);
  assert.equal(Number(day.active_session.opening_cash), 5000);
  day1Id = day.id;

  const ctx = await businessDayContext(db);
  assert.equal(ctx.current.id, day1Id);
  assert.ok(ctx.activeSession);
  assert.equal(ctx.requiresOpening, false);
  assert.equal(ctx.storeClosed, false);

  const drawer = await db.get(`SELECT id FROM cash_drawers WHERE is_active = 1 ORDER BY id LIMIT 1`);
  drawer1Id = drawer.id;
});

test('rejects negative opening cash', async () => {
  const error = await catchError(openBusinessDay(db, { business_date: today, opening_cash: -5 }, admin));
  assert.match(error?.message || '', /negative/i);
});

test('rejects a future Nepal business date', async () => {
  const error = await catchError(openBusinessDay(db, { business_date: tomorrow, opening_cash: 100 }, admin));
  assert.match(error?.message || '', /future/i);
});

test('rejects opening a second business day while one is already open', async () => {
  const error = await catchError(openBusinessDay(db, { business_date: today, opening_cash: 100 }, admin));
  assert.equal(error?.status, 409);
});

test('expected cash calculation includes opening cash plus cash-account journal movement', async () => {
  await postCashSale(2000, day1Id, drawer1Id);
  const summary = await businessDaySummary(db, day1Id);
  assert.equal(summary.cash.expected_cash, 7000); // 5000 opening + 2000 cash sale
});

test('matched cash close requires no closing note', async () => {
  const result = await closeBusinessDay(db, { counted_cash: 7000 }, admin, { force: false });
  assert.equal(Number(result.business_day.cash_difference), 0);
  assert.equal(result.business_day.closing_note, null);
  assert.equal(result.store_session.status, 'closed');
});

test('cash sales posted after drawer close are identified separately', async () => {
  await postCashSale(1500, day1Id, drawer1Id);
  const lateSale = await db.get(
    `SELECT id FROM journal_entries WHERE source_type='retail_sale' AND business_day_id=? ORDER BY id DESC LIMIT 1`,
    [day1Id]
  );
  await db.run(`UPDATE journal_entries SET created_at='2999-01-01 00:00:00' WHERE id=?`, [lateSale.id]);

  const summary = await businessDaySummary(db, day1Id);
  assert.equal(summary.cash.business_day_cash_sales, 3500);
  assert.equal(summary.cash.breakdown.cash_collections, 2000);
  assert.equal(summary.cash.post_close_cash_sales, 1500);
  assert.equal(summary.cash.earlier_session_cash_sales, 0);

  // Restore the ordered lifecycle fixture before the same-day reopen tests.
  await db.run('DELETE FROM journal_lines WHERE journal_id=?', [lateSale.id]);
  await db.run('DELETE FROM journal_entries WHERE id=?', [lateSale.id]);
});

test('closing snapshot is persisted on both business_days and business_day_sessions', async () => {
  const bd = await db.get('SELECT closing_snapshot FROM business_days WHERE id=?', [day1Id]);
  assert.ok(bd.closing_snapshot);
  assert.ok(JSON.parse(bd.closing_snapshot).cash);
  const session = await db.get(
    'SELECT closing_snapshot FROM business_day_sessions WHERE business_day_id=? ORDER BY id DESC LIMIT 1',
    [day1Id]
  );
  assert.ok(session.closing_snapshot);
});

test('audit records are written for opening and closing', async () => {
  const rows = await db.all('SELECT action FROM business_day_audit WHERE business_day_id=? ORDER BY id', [day1Id]);
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes('business_day_opened'));
  assert.ok(actions.includes('store_session_opened'));
  assert.ok(actions.includes('store_session_closed'));
});

/* ------------------------------------------------------------ opening: mode B */

test('same-day reopen creates a new session under the same business_day_id without resetting day totals', async () => {
  const day = await openBusinessDay(db, { business_date: today, opening_cash: 7000, action: 'reopen_same_day' }, admin);
  assert.equal(day.id, day1Id);
  assert.equal(day.reopened, true);
  assert.equal(day.active_session.session_number, 2);

  const bd = await db.get('SELECT opening_cash, status FROM business_days WHERE id=?', [day1Id]);
  assert.equal(Number(bd.opening_cash), 5000); // day-level opening figure from first open is untouched
  assert.equal(bd.status, 'open');

  const summary = await businessDaySummary(db, day1Id);
  assert.equal(summary.cash.scope, 'store_session');
  assert.equal(summary.cash.session_number, 2);
  assert.equal(summary.cash.session_count, 2);
  assert.equal(summary.cash.business_day_cash_sales, 2000);
  assert.equal(summary.cash.breakdown.cash_collections, 0);
  assert.equal(summary.cash.earlier_session_cash_sales, 2000);
  assert.equal(summary.cash.post_close_cash_sales, 0);
});

test('over cash close is rejected without a closing note, accepted with one', async () => {
  const rejected = await catchError(closeBusinessDay(db, { counted_cash: 7200 }, admin, { force: false }));
  assert.equal(rejected?.status, 422);
  assert.match(rejected?.message || '', /note/i);

  const result = await closeBusinessDay(db, { counted_cash: 7200, closing_note: 'Extra tip pooled in drawer' }, admin, { force: false });
  assert.equal(Number(result.business_day.cash_difference), 200);
  const overJournal = await db.get(
    `SELECT id FROM journal_entries WHERE source_type='business_day_close' ORDER BY id DESC LIMIT 1`
  );
  assert.ok(overJournal, 'cash over must post a business_day_close journal');
  const overLines = await db.all(
    `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE jl.journal_id=?`,
    [overJournal.id]
  );
  assert.ok(overLines.some((l) => l.code === '5060' && Number(l.credit) === 200));
  assert.ok(overLines.some((l) => l.code === '1010' && Number(l.debit) === 200));
});

test('missing opening cash movement reason is rejected when opening cash differs from prior counted cash', async () => {
  const error = await catchError(openBusinessDay(db, { business_date: today, opening_cash: 6000, action: 'reopen_same_day' }, admin));
  assert.match(error?.message || '', /where the opening cash difference came from/i);
});

test('missing "Other" note is rejected', async () => {
  const error = await catchError(openBusinessDay(db, {
    business_date: today, opening_cash: 6000, action: 'reopen_same_day', opening_cash_reason: 'other',
  }, admin));
  assert.match(error?.message || '', /note/i);
});

test('opening cash movement is classified and posts a balanced journal for only the difference', async () => {
  const day = await openBusinessDay(db, {
    business_date: today, opening_cash: 6000, action: 'reopen_same_day',
    opening_cash_reason: 'cash_reserve', opening_cash_note: 'Moved to safe',
  }, admin);
  assert.equal(day.active_session.session_number, 3);
  assert.equal(Number(day.active_session.opening_cash), 6000);

  const journal = await db.get(`SELECT * FROM journal_entries WHERE source_type='opening_cash_movement' ORDER BY id DESC LIMIT 1`);
  assert.ok(journal);
  const lines = await db.all(`SELECT * FROM journal_lines WHERE journal_id=?`, [journal.id]);
  const debit = round2(lines.reduce((s, l) => s + Number(l.debit), 0));
  const credit = round2(lines.reduce((s, l) => s + Number(l.credit), 0));
  assert.equal(debit, credit);
  assert.equal(debit, 1200); // 7200 -> 6000, only the difference is posted
});

test('short cash close is rejected without a closing note, accepted with one', async () => {
  const rejected = await catchError(closeBusinessDay(db, { counted_cash: 5800 }, admin, { force: false }));
  assert.equal(rejected?.status, 422);

  const result = await closeBusinessDay(db, { counted_cash: 5800, closing_note: 'Till was short at count' }, admin, { force: false });
  assert.equal(Number(result.business_day.cash_difference), -200);
  const shortJournal = await db.get(
    `SELECT id FROM journal_entries WHERE source_type='business_day_close' ORDER BY id DESC LIMIT 1`
  );
  assert.ok(shortJournal, 'cash short must post a business_day_close journal');
  const shortLines = await db.all(
    `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE jl.journal_id=?`,
    [shortJournal.id]
  );
  assert.ok(shortLines.some((l) => l.code === '5060' && Number(l.debit) === 200));
  assert.ok(shortLines.some((l) => l.code === '1010' && Number(l.credit) === 200));
});

/* ------------------------------------------------------------ closing blockers */

test('a reopened store session has no closing blockers', async () => {
  await openBusinessDay(db, { business_date: today, opening_cash: 5800, action: 'reopen_same_day' }, admin); // session 4
  const blockers = await closingBlockers(db, day1Id);
  assert.equal(blockers.canCloseNormally, true);
});

/* ------------------------------------------------------------ force close */

test('force close requires a reason', async () => {
  const error = await catchError(closeBusinessDay(db, { counted_cash: 5800 }, admin, { force: true }));
  assert.match(error?.message || '', /reason is required to force close/i);
});

test('force close marks both rows force_closed', async () => {
  const cashDenominations = { 1000: 5, 500: 1, 100: 3 };
  const result = await closeBusinessDay(db, { counted_cash: 5800, cash_denominations: cashDenominations, force_close_reason: 'Customer dispute, unresolved at close' }, admin, { force: true });
  assert.equal(result.business_day.force_closed, 1);
  assert.equal(result.store_session.status, 'closed');

  const rows = await db.all('SELECT action FROM business_day_audit WHERE business_day_id=? ORDER BY id DESC LIMIT 1', [day1Id]);
  assert.equal(rows[0].action, 'store_session_force_closed');

  const detail = await businessDayDetail(db, day1Id);
  assert.deepEqual(detail.summary.reconciliation.cash_denominations, cashDenominations);
});

test('summary report includes the latest saved note count before the business day is finalized', async () => {
  const closing = await closingReconciliation(db, today, today);
  assert.equal(closing.days_closed, 1);
  assert.equal(closing.days_recorded, 1);
  assert.equal(closing.counted_cash, 5800);
  assert.deepEqual(closing.cash_denominations, { 100: 3, 500: 1, 1000: 5 });
});

/* ------------------------------------------------------------ stale-day handling */

test('a business day whose date has rolled past today is detected as stale', async () => {
  await db.run('UPDATE business_days SET business_date=? WHERE id=?', [yesterday, day1Id]);
  const day = await db.get('SELECT * FROM business_days WHERE id=?', [day1Id]);
  assert.equal(isStaleBusinessDay(day), true);
  assert.equal(isStaleAcknowledged(day), false);

  const ctx = await businessDayContext(db);
  assert.equal(ctx.current.id, day1Id);
  assert.equal(ctx.isStale, true);
  assert.equal(ctx.staleAcknowledged, false);
});

test('new activity is blocked with 409 on an unacknowledged stale day, but allowStale bypasses it', async () => {
  const blocked = await catchError(currentBusinessDayId(db, { required: true }));
  assert.equal(blocked?.status, 409);
  assert.equal(blocked?.code, 'business_day_stale');

  // allowStale skips the staleness gate; it still fails because the store session
  // is closed, proving allowStale bypassed staleness specifically, not everything.
  const stillNoSession = await catchError(currentBusinessDayId(db, { required: true, allowStale: true }));
  assert.equal(stillNoSession?.code, 'store_session_required');
});

test('continue_stale requires confirmation and a reason, then acknowledges the day', async () => {
  const noConfirm = await catchError(openBusinessDay(db, { action: 'continue_stale' }, admin));
  assert.match(noConfirm?.message || '', /confirm/i);

  const noReason = await catchError(openBusinessDay(db, { action: 'continue_stale', confirm_continue_stale: true }, admin));
  assert.match(noReason?.message || '', /reason/i);

  const result = await openBusinessDay(db, {
    action: 'continue_stale', confirm_continue_stale: true, reason: 'Night audit still pending',
  }, admin);
  assert.equal(result.stale_acknowledged, true);
  assert.equal(result.stale_ack_date, today);

  const audit = await db.all(`SELECT action, reason FROM business_day_audit WHERE business_day_id=? ORDER BY id DESC LIMIT 1`, [day1Id]);
  assert.equal(audit[0].action, 'business_day_stale_acknowledged');
  assert.equal(audit[0].reason, 'Night audit still pending');

  // Acknowledged: the stale gate no longer fires (store_session_required still does, no session is open).
  const afterAck = await catchError(currentBusinessDayId(db, { required: true }));
  assert.equal(afterAck?.code, 'store_session_required');
});

test('stale acknowledgement expires automatically once the ack date is not today', async () => {
  await db.run('UPDATE business_days SET stale_ack_date=? WHERE id=?', [yesterday, day1Id]);
  const expired = await catchError(currentBusinessDayId(db, { required: true }));
  assert.equal(expired?.code, 'business_day_stale');
});

/* ------------------------------------------------------------ starting the next day */

let day2Id;

test('starting the next business day finalizes the previous day', async () => {
  const day2 = await openBusinessDay(db, {
    // The server, not the browser locale/date picker, selects today's Nepal
    // date when starting the next day.
    business_date: '2000-01-01', opening_cash: 5800, action: 'start_next', confirm_next_day: true,
  }, admin);
  day2Id = day2.id;
  assert.equal(day2.business_date, today);

  const finalizedDay1 = await db.get('SELECT status FROM business_days WHERE id=?', [day1Id]);
  assert.equal(finalizedDay1.status, 'closed');
  const finalizedSnapshot = JSON.parse((await db.get('SELECT closing_snapshot FROM business_days WHERE id=?', [day1Id])).closing_snapshot);
  assert.deepEqual(finalizedSnapshot.reconciliation.cash_denominations, { 100: 3, 500: 1, 1000: 5 });
  const finalizedDetail = await businessDayDetail(db, day1Id);
  assert.deepEqual(finalizedDetail.summary.reconciliation.cash_denominations, { 100: 3, 500: 1, 1000: 5 });
});

test('a reversal after close keeps the physical count frozen and exposes adjusted closing cash', async () => {
  const sale = await db.get(
    `SELECT id FROM journal_entries WHERE source_type='retail_sale' AND business_day_id=? ORDER BY id LIMIT 1`,
    [day1Id]
  );
  const original = await businessDaySummary(db, day1Id);
  const originalExpected = Number(original.cash.expected_cash);
  await reverseJournal(db, {
    journal_id: sale.id, reason: 'Post-close correction test', created_by: admin.id, business_day_id: day2Id,
  });

  const adjusted = await businessDaySummary(db, day1Id);
  assert.equal(adjusted.cash.original_expected_cash, originalExpected);
  assert.equal(adjusted.cash.adjusted_expected_cash, originalExpected - 2000);
  assert.equal(adjusted.post_close_adjustments.cash_delta, -2000);
  assert.equal(Number(adjusted.reconciliation.counted_cash), Number(original.reconciliation.counted_cash));

  const period = await closingReconciliation(db, yesterday, yesterday);
  assert.equal(period.expected_cash, originalExpected);
  assert.equal(period.adjusted_expected_cash, originalExpected - 2000);
  assert.equal(period.post_close_adjustments.cash_delta, -2000);

  // Neutralise the test correction in the current drawer so later lifecycle
  // tests retain their original expected-cash fixture.
  await postJournal(db, {
    memo: 'Post-close correction test fixture offset', source_type: 'manual_adjustment', business_day_id: day2Id,
    lines: [{ code: '1010', debit: 2000, credit: 0, drawer_id: drawer1Id }, { code: '3010', debit: 0, credit: 2000 }],
  });
});

test('allowStale still resolves the current day while it is stale', async () => {
  await db.run('UPDATE business_days SET business_date=? WHERE id=?', [twoDaysAgo, day2Id]);

  const newActivityBlocked = await catchError(currentBusinessDayId(db, { required: true }));
  assert.equal(newActivityBlocked?.code, 'business_day_stale');

  const continued = await currentBusinessDayId(db, { required: true, allowStale: true });
  assert.equal(continued, day2Id);
});

/* ------------------------------------------------------------ atomic rollback */

test('a failed opening cash movement (no active bank account) rolls back the whole transaction', async () => {
  // Bring day2 back to today so it can close cleanly.
  await db.run('UPDATE business_days SET business_date=? WHERE id=?', [today, day2Id]);
  await closeBusinessDay(db, { counted_cash: 5800 }, admin, { force: false });

  await db.run(`UPDATE bank_accounts SET is_active = 0`);
  const sessionsBefore = Number((await db.get('SELECT COUNT(*) n FROM business_day_sessions')).n);
  const journalsBefore = Number((await db.get(`SELECT COUNT(*) n FROM journal_entries WHERE source_type='opening_cash_movement'`)).n);

  const error = await catchError(openBusinessDay(db, {
    business_date: today, opening_cash: 5000, action: 'reopen_same_day', opening_cash_reason: 'bank_deposit',
  }, admin));
  assert.match(error?.message || '', /active bank account/i);

  const sessionsAfter = Number((await db.get('SELECT COUNT(*) n FROM business_day_sessions')).n);
  const journalsAfter = Number((await db.get(`SELECT COUNT(*) n FROM journal_entries WHERE source_type='opening_cash_movement'`)).n);
  assert.equal(sessionsAfter, sessionsBefore);
  assert.equal(journalsAfter, journalsBefore);

  const ctx = await businessDayContext(db);
  assert.ok(!ctx.activeSession); // the failed reopen left no partial session

  await db.run(`UPDATE bank_accounts SET is_active = 1`);
});

/* ------------------------------------------------------------ cashier parity */

test('permission matrix: cashier can open/close but not force-close; admin can do everything', () => {
  assert.equal(hasPermission('cashier', 'business_days.open'), true);
  assert.equal(hasPermission('cashier', 'business_days.close'), true);
  assert.equal(hasPermission('cashier', 'business_days.force_close'), false);
  assert.equal(hasPermission('admin', 'business_days.force_close'), true);
});

test('a cashier actor can open and close a business day exactly like an admin', async () => {
  const opened = await openBusinessDay(db, { business_date: today, opening_cash: 5800, action: 'reopen_same_day' }, cashier);
  assert.equal(opened.reopened, true);
  assert.equal(opened.active_session.opened_by, cashier.id);

  const closed = await closeBusinessDay(db, { counted_cash: 5800 }, cashier, { force: false, now: new Date(`${today}T20:30:00+05:45`) });
  assert.equal(closed.store_session.closed_by, cashier.id);
  assert.equal(Number(closed.business_day.cash_difference), 0);
});

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
