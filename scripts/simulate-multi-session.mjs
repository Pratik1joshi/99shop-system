/**
 * Simulate multiple store sessions on one business day.
 *
 * Postgres (requires DATABASE_URL):
 *   DATABASE_URL=postgresql://... node --import ./tests/unit/loader-register.mjs scripts/simulate-multi-session.mjs
 *
 * Local SQLite (default when DATABASE_URL is unset):
 *   node --import ./tests/unit/loader-register.mjs scripts/simulate-multi-session.mjs
 *
 * Safe to re-run: uses today's Nepal business day if open, otherwise creates a demo day
 * tagged with memo/external_ref prefix `multi-session-sim:`.
 */
import { nepalDateString } from '../lib/report-dates.js';

const MARK = 'multi-session-sim';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { default: Database } = await import('../lib/db/index.js');
const { ensureAccountingSchema, postJournal, accountBalance } = await import('../lib/accounting.js');
const {
  ensureBusinessDaySchema,
  openBusinessDay,
  closeBusinessDay,
  businessDaySummary,
} = await import('../lib/business-days.js');

const db = Database.getInstance();
const driver = db.driver || (process.env.DATABASE_URL ? 'postgres' : 'sqlite');
const today = nepalDateString();
const actor = { id: 1, full_name: 'Multi-session Sim', role: 'admin' };

const money = (n) => `Rs ${Number(n || 0).toFixed(2)}`;

async function ensureAdmin() {
  const row = await db.get(`SELECT id, full_name, role FROM users WHERE role='admin' ORDER BY id LIMIT 1`);
  if (row) return { id: row.id, full_name: row.full_name || 'Admin', role: 'admin' };
  return actor;
}

async function listSessions(dayId) {
  return db.all(
    `SELECT id, session_number, status, opening_cash, expected_cash, counted_cash, cash_difference,
            opened_at, closed_at
     FROM business_day_sessions
     WHERE business_day_id=?
     ORDER BY session_number`,
    [dayId]
  );
}

function printSessions(rows, label) {
  console.log(`\n=== ${label} ===`);
  for (const s of rows) {
    console.log(
      `  session ${s.session_number} · ${s.status}` +
      ` · open ${money(s.opening_cash)}` +
      ` · expected ${s.expected_cash == null ? '—' : money(s.expected_cash)}` +
      ` · counted ${s.counted_cash == null ? '—' : money(s.counted_cash)}`
    );
  }
}

try {
  await ensureAccountingSchema(db);
  await ensureBusinessDaySchema(db);
  const admin = await ensureAdmin();
  const drawer = await db.get(`SELECT id FROM cash_drawers WHERE is_active=1 ORDER BY id LIMIT 1`);

  console.log(`Driver: ${driver}`);
  console.log(`Nepal today: ${today}`);

  // Prefer the currently open business day (even if stale vs Nepal today),
  // so the sim can demonstrate multi-session without fighting start_next.
  let day = await db.get(`SELECT * FROM business_days WHERE status='open' ORDER BY business_date DESC, id DESC LIMIT 1`);
  if (!day) {
    day = await openBusinessDay(db, {
      business_date: today,
      opening_cash: 5000,
      opening_note: `${MARK} morning open`,
    }, admin);
    console.log(`\nOpened business day ${day.business_date || today} (session 1) with opening cash ${money(5000)}`);
  } else {
    console.log(`\nUsing open business day ${day.business_date} (id=${day.id}, status=${day.status})`);
    if (String(day.business_date).slice(0, 10) !== today) {
      console.log(`  (stale vs Nepal today ${today} — still fine for multi-session demo)`);
    }
  }

  const dayId = day.id;
  const dayDate = String(day.business_date).slice(0, 10);

  // Ensure session 1 is closed so reopen is allowed.
  const openSession = await db.get(
    `SELECT * FROM business_day_sessions WHERE business_day_id=? AND status='open' ORDER BY session_number DESC LIMIT 1`,
    [dayId]
  );
  if (openSession) {
    // Seed a cash sale into this session so expected ≠ opening.
    await postJournal(db, {
      memo: `${MARK} session ${openSession.session_number} cash sale`,
      source_type: 'bill',
      business_day_id: dayId,
      created_by: admin.id,
      lines: [
        { code: '1010', debit: 1200, credit: 0, drawer_id: drawer?.id },
        { code: '4010', debit: 0, credit: 1200 },
      ],
    });
    const summaryBeforeClose = await businessDaySummary(db, dayId);
    const expected = Number(summaryBeforeClose.cash.expected_cash || 0);
    await closeBusinessDay(db, {
      counted_cash: expected,
      closing_note: `${MARK} close session ${openSession.session_number}`,
      force_close_reason: `${MARK} force-close to demo multi-session`,
    }, admin, { force: true });
    console.log(`Closed store session ${openSession.session_number} (counted ${money(expected)}) — business day stays OPEN`);
  }

  printSessions(await listSessions(dayId), 'After session close');

  // Stale open days block reopen until acknowledged.
  if (String(day.business_date).slice(0, 10) !== today) {
    await openBusinessDay(db, {
      action: 'continue_stale',
      confirm_continue_stale: true,
      reason: `${MARK} acknowledge stale day to reopen another session`,
    }, admin);
    console.log('Acknowledged stale business day so same-day reopen is allowed');
  }

  // Reopen same day → next session (possibly with cash moved to reserve).
  const latestClosed = await db.get(
    `SELECT * FROM business_day_sessions WHERE business_day_id=? AND status='closed' ORDER BY session_number DESC LIMIT 1`,
    [dayId]
  );
  const priorCounted = Number(latestClosed?.counted_cash || 0);
  const session2Opening = Math.max(0, round2(priorCounted - 500)); // remove 500 to reserve if possible
  const reopen = await openBusinessDay(db, {
    business_date: dayDate,
    action: 'reopen_same_day',
    opening_cash: session2Opening,
    opening_note: `${MARK} afternoon reopen`,
    ...(Math.abs(session2Opening - priorCounted) >= 0.01
      ? { opening_cash_reason: 'cash_reserve', opening_cash_note: `${MARK} parked in safe between shifts` }
      : {}),
  }, admin);

  console.log(`\nReopened same day → session ${reopen.active_session.session_number}`);
  console.log(`  day.opening_cash (first open, frozen): ${money((await db.get(`SELECT opening_cash FROM business_days WHERE id=?`, [dayId])).opening_cash)}`);
  console.log(`  session opening_cash: ${money(reopen.active_session.opening_cash)}`);

  // Sale in new session only.
  await postJournal(db, {
    memo: `${MARK} session ${reopen.active_session.session_number} cash sale`,
    source_type: 'bill',
    business_day_id: dayId,
    created_by: admin.id,
    lines: [
      { code: '1010', debit: 800, credit: 0, drawer_id: drawer?.id },
      { code: '4010', debit: 0, credit: 800 },
    ],
  });

  const summary = await businessDaySummary(db, dayId);
  printSessions(await listSessions(dayId), 'Sessions on this business day');

  console.log('\n=== What close UI / summary shows NOW (active session) ===');
  console.log(`  cash.scope: ${summary.cash.scope}`);
  console.log(`  session: ${summary.cash.session_number} of ${summary.cash.session_count}`);
  console.log(`  session opening (breakdown): ${money(summary.cash.breakdown.opening_cash)}`);
  console.log(`  expected drawer cash (THIS session): ${money(summary.cash.expected_cash)}`);
  console.log(`  business_day_cash_sales (ALL day): ${money(summary.cash.business_day_cash_sales)}`);
  console.log(`  earlier_session_cash_sales: ${money(summary.cash.earlier_session_cash_sales)}`);
  console.log(`  this session cash_collections: ${money(summary.cash.breakdown.cash_collections)}`);
  console.log(`  ledger cash 1010: ${money(await accountBalance(db, '1010'))}`);

  console.log('\nWhere to see this in the app:');
  console.log('  • Business Days → banner "Opening Cash" = active session opening');
  console.log('  • Close screen title: "Store session N of M · Cash reconciliation"');
  console.log('  • Sales/payments on close = whole day; expected cash = current session only');
  console.log('  • History table columns = LATEST session values (not a per-session list)');
  console.log('  • Day notes / audit: store_session_opened + store_session_reopened + closed');
  console.log('  • Summary Report cash opening = first day opening_cash (frozen)');
} catch (error) {
  console.error('\nSimulation failed:', error.message || error);
  if (!process.env.DATABASE_URL) {
    console.error('Tip: for Postgres set DATABASE_URL=postgresql://user:pass@localhost:5432/dbname');
  }
  process.exitCode = 1;
} finally {
  try { db.close?.(); } catch { /* ignore */ }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
