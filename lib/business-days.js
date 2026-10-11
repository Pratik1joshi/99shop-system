import { assertCashClosingAllowed } from './cash-closing-policy.js';
import { ensureColumn, serialPkSql } from '@/lib/db/schema-helpers.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { getNepaliDateString } from '@/lib/time-utils.js';
import { nepalDateString } from '@/lib/report-dates.js';
import { openSession } from '@/lib/accounting-cash.js';
import { accountBalance, postJournal, ensureAccountingSchema } from '@/lib/accounting.js';
import { paymentBucket } from '@/lib/report-scope.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const fail = (message, status = 400, extra = {}) => {
  throw Object.assign(new Error(message), { status, ...extra });
};
const safe = async (promise, fallback) => {
  try { return await promise; } catch { return fallback; }
};
const json = (value) => JSON.stringify(value ?? null);
const businessDateKey = (value) => {
  if (!value) return '';
  if (value instanceof Date) return nepalDateString(value);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return nepalDateString(parsed);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.slice(0, 10);
};
const addDays = (dateValue, days) => {
  const date = new Date(`${businessDateKey(dateValue)}T12:00:00+05:45`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(date);
};
const OPENING_CASH_REASONS = new Set([
  'cash_reserve',
  'bank_deposit',
  'owner_withdrawal',
  'bank_withdrawal',
  'owner_contribution',
  'other',
]);
const CASH_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5, 1];

function normalizeCashDenominations(input, countedCash) {
  // Optional for older clients/closed records, but when supplied it must
  // reconcile exactly to the submitted physical cash total.
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) fail('Cash denominations must be a note-count object.');

  const counts = {};
  let total = 0;
  for (const denomination of CASH_DENOMINATIONS) {
    const raw = input[denomination] ?? input[String(denomination)];
    if (raw === '' || raw == null) continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      fail(`Enter a whole, non-negative quantity for Rs ${denomination} notes.`);
    }
    if (quantity > 0) counts[denomination] = quantity;
    total += denomination * quantity;
  }
  if (Math.abs(round2(total) - countedCash) >= 0.005) {
    fail('The note count does not match the counted cash total.', 422);
  }
  return counts;
}

const ASSOCIATIONS = [
  ['customer_ledger', 'business_day_id', 'INTEGER'],
  ['expenses', 'business_day_id', 'INTEGER'],
  ['journal_entries', 'business_day_id', 'INTEGER'],
  ['drawer_sessions', 'business_day_id', 'INTEGER'],
  ['payment_settlements', 'business_day_id', 'INTEGER'],
  ['salary_payments', 'business_day_id', 'INTEGER'],
  ['salary_advances', 'business_day_id', 'INTEGER'],
];

export async function ensureBusinessDaySchema(db) {
  if (db.driver === 'postgres') {
    const ready = await db.get(`SELECT to_regclass('public.business_days') AS business_days`);
    if (!ready?.business_days) fail('Business day schema is not installed. Run npm run db:migrate.', 503, { code: 'schema_missing', expose: true });
    return;
  }

  const pk = serialPkSql(db);
  await ensureColumn(db, 'expenses', 'status', "TEXT DEFAULT 'active'").catch(() => {});
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS business_days (
    ${pk}, business_date TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'open',
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, opened_by INTEGER,
    opening_cash REAL NOT NULL DEFAULT 0, opening_note TEXT, closed_at DATETIME,
    closed_by INTEGER, expected_cash REAL, counted_cash REAL, cash_difference REAL,
    closing_note TEXT, force_closed INTEGER NOT NULL DEFAULT 0, force_close_reason TEXT,
    approved_by INTEGER, closing_snapshot TEXT, stale_ack_date TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS business_day_audit (
    ${pk}, business_day_id INTEGER NOT NULL, action TEXT NOT NULL, actor_id INTEGER,
    actor_name TEXT, previous_value TEXT, new_value TEXT, reason TEXT, detail TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS business_day_sessions (
    ${pk}, business_day_id INTEGER NOT NULL, session_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    opened_by INTEGER, opening_cash REAL NOT NULL DEFAULT 0, opening_note TEXT,
    closed_at DATETIME, closed_by INTEGER, expected_cash REAL, counted_cash REAL,
    cash_difference REAL, closing_note TEXT, force_closed INTEGER NOT NULL DEFAULT 0,
    force_close_reason TEXT, closing_snapshot TEXT, drawer_session_id INTEGER,
    opening_journal_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_business_days_one_open ON business_days(status) WHERE status = 'open'`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_business_day_audit_day ON business_day_audit(business_day_id, created_at, id)`);
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_business_day_sessions_one_open ON business_day_sessions(business_day_id, status) WHERE status = 'open'`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_business_day_sessions_day ON business_day_sessions(business_day_id, session_number)`);

  for (const [table, column, ddl] of ASSOCIATIONS) {
    await ensureColumn(db, table, column, ddl).catch(() => false);
  }
  await ensureColumn(db, 'business_day_sessions', 'opening_journal_id', 'INTEGER');
  await ensureColumn(db, 'business_days', 'stale_ack_date', 'TEXT');

  // One-time continuity bridge for local databases that already had an open shift.
  const anyDay = await db.get(`SELECT id FROM business_days LIMIT 1`);
  if (!anyDay) {
    const shift = await safe(db.get(`SELECT * FROM drawer_sessions WHERE status = 'open' ORDER BY opened_at DESC, id DESC LIMIT 1`), null);
    if (shift) {
      const businessDate = getNepaliDateString(shift.opened_at);
      const inserted = await db.run(
        `INSERT INTO business_days (business_date, status, opened_at, opened_by, opening_cash, opening_note)
         VALUES (?, 'open', ?, ?, ?, ?)`,
        [businessDate, shift.opened_at, shift.opened_by || null, round2(shift.opening_amount),
          'Continued from the drawer session active when business days were installed.']
      );
      await db.run(`UPDATE drawer_sessions SET business_day_id = ? WHERE id = ?`, [inserted.lastInsertRowid, shift.id]);
      await db.run(
        `INSERT INTO business_day_sessions (business_day_id, session_number, status, opened_at, opened_by, opening_cash, opening_note, drawer_session_id)
         VALUES (?, 1, 'open', ?, ?, ?, ?, ?)`,
        [inserted.lastInsertRowid, shift.opened_at, shift.opened_by || null, round2(shift.opening_amount),
          'Continued from the drawer session active when business days were installed.', shift.id]
      );
    }
  }

  await backfillSqliteSessions(db);

  await backfillSqliteAssociations(db);
}

async function backfillSqliteSessions(db) {
  const days = await safe(db.all(`SELECT * FROM business_days WHERE id NOT IN (SELECT business_day_id FROM business_day_sessions)`), []);
  for (const day of days || []) {
    const drawer = await safe(db.get(`SELECT * FROM drawer_sessions WHERE business_day_id=? ORDER BY opened_at,id LIMIT 1`, [day.id]), null);
    const isOpen = day.status === 'open' && !day.closed_at;
    await db.run(
      `INSERT INTO business_day_sessions
       (business_day_id, session_number, status, opened_at, opened_by, opening_cash, opening_note,
        closed_at, closed_by, expected_cash, counted_cash, cash_difference, closing_note,
        force_closed, force_close_reason, closing_snapshot, drawer_session_id, opening_journal_id)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [day.id, isOpen ? 'open' : 'closed', day.opened_at, day.opened_by || null, round2(day.opening_cash),
        day.opening_note || null, isOpen ? null : day.closed_at, day.closed_by || null,
        day.expected_cash, day.counted_cash, day.cash_difference, day.closing_note || null,
        day.force_closed || 0, day.force_close_reason || null, day.closing_snapshot || null, drawer?.id || null, null]
    );
  }
}

async function backfillSqliteAssociations(db) {
  const open = await db.get(`SELECT * FROM business_days WHERE status = 'open' LIMIT 1`);
  const dates = await safe(db.all(`
    SELECT DISTINCT date(created_at, '+5 hours', '+45 minutes') AS d FROM expenses WHERE business_day_id IS NULL
    UNION SELECT DISTINCT entry_date FROM journal_entries WHERE business_day_id IS NULL`), []);
  for (const row of dates) {
    // Never manufacture a closed historical day *after* an older day that is
    // still open. That contradictory state makes the old day look as though it
    // reopened and lets newly entered cash activity fall into the wrong drawer
    // session. Explicit business-day actions must resolve the open day first.
    if (!row?.d || row.d === open?.business_date || row.d === getNepaliDateString()) continue;
    if (open && businessDateKey(row.d) > businessDateKey(open.business_date)) continue;
    await db.run(
      `INSERT OR IGNORE INTO business_days
       (business_date, status, opened_at, closed_at, opening_cash, opening_note)
       VALUES (?, 'closed', ?, ?, 0, ?)`,
      [row.d, `${row.d} 00:00:00`, `${row.d} 23:59:59`, 'Historical calendar-date backfill; no opening count was available.']
    );
  }
  await safe(db.run(`UPDATE expenses SET business_day_id = (
    SELECT id FROM business_days WHERE status='closed' AND business_date = COALESCE(expenses.purchase_date, expenses.expense_date))
    WHERE business_day_id IS NULL`), null);
  await safe(db.run(`UPDATE journal_entries SET business_day_id = (SELECT id FROM business_days WHERE status='closed' AND business_date = journal_entries.entry_date) WHERE business_day_id IS NULL`), null);

  // Only the one-time open-drawer continuity bridge may adopt pre-existing rows.
  // A day opened explicitly through the new workflow must always begin empty.
  if (open?.opening_note?.startsWith('Continued from the drawer session')) {
    await safe(db.run(`UPDATE expenses SET business_day_id=? WHERE business_day_id IS NULL AND created_at>=?`, [open.id, open.opened_at]), null);
    await safe(db.run(`UPDATE journal_entries SET business_day_id=? WHERE business_day_id IS NULL AND created_at>=?`, [open.id, open.opened_at]), null);
  }
}

export async function currentBusinessDay(db, { required = false } = {}) {
  await ensureBusinessDaySchema(db);
  const day = await db.get(`
    SELECT bd.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
    FROM business_days bd
    LEFT JOIN users ou ON ou.id = bd.opened_by
    LEFT JOIN users cu ON cu.id = bd.closed_by
    WHERE bd.status = 'open' ORDER BY bd.id DESC LIMIT 1`);
  if (!day && required) fail('Open a business day before recording shop activity.', 409, { code: 'business_day_required' });
  return day ? { ...day, business_date: businessDateKey(day.business_date) } : null;
}

export async function activeStoreSession(db, businessDayId = null) {
  await ensureBusinessDaySchema(db);
  const dayId = businessDayId || (await currentBusinessDay(db))?.id || null;
  if (!dayId) return null;
  return db.get(
    `SELECT s.*, ou.full_name AS opened_by_name
     FROM business_day_sessions s
     LEFT JOIN users ou ON ou.id = s.opened_by
     WHERE s.business_day_id=? AND s.status='open'
     ORDER BY s.session_number DESC, s.id DESC LIMIT 1`,
    [dayId]
  );
}

async function latestStoreSession(db, businessDayId) {
  if (!businessDayId) return null;
  return db.get(`SELECT s.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
    FROM business_day_sessions s
    LEFT JOIN users ou ON ou.id=s.opened_by LEFT JOIN users cu ON cu.id=s.closed_by
    WHERE s.business_day_id=? ORDER BY s.session_number DESC,s.id DESC LIMIT 1`, [businessDayId]);
}

/** All store sessions for a business day — used by the close UI session switcher. */
export async function listBusinessDaySessions(db, businessDayId) {
  if (!businessDayId) return [];
  await ensureBusinessDaySchema(db);
  const rows = await db.all(
    `SELECT s.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
     FROM business_day_sessions s
     LEFT JOIN users ou ON ou.id=s.opened_by
     LEFT JOIN users cu ON cu.id=s.closed_by
     WHERE s.business_day_id=?
     ORDER BY s.session_number ASC, s.id ASC`,
    [businessDayId]
  );
  return (rows || []).map((row) => {
    let snapshot = null;
    if (row.closing_snapshot) {
      try { snapshot = JSON.parse(row.closing_snapshot); } catch { snapshot = null; }
    }
    const cash = snapshot?.cash || null;
    const reconciliation = snapshot?.reconciliation || null;
    return {
      id: row.id,
      session_number: Number(row.session_number || 0),
      status: row.status,
      opening_cash: round2(row.opening_cash),
      expected_cash: row.expected_cash == null ? null : round2(row.expected_cash),
      counted_cash: row.counted_cash == null ? null : round2(row.counted_cash),
      cash_difference: row.cash_difference == null ? null : round2(row.cash_difference),
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      opening_note: row.opening_note || null,
      closing_note: row.closing_note || null,
      opened_by_name: row.opened_by_name || null,
      closed_by_name: row.closed_by_name || null,
      cash_breakdown: cash?.breakdown || null,
      cash_collections: cash?.breakdown?.cash_collections == null
        ? null
        : round2(cash.breakdown.cash_collections),
      reconciliation,
    };
  });
}

export function isStaleBusinessDay(day) {
  return !!day && day.status === 'open' && businessDateKey(day.business_date) < getNepaliDateString();
}

export function isStaleAcknowledged(day) {
  return !!day && day.stale_ack_date === getNepaliDateString();
}

export async function currentBusinessDayId(db, { required = false, allowStale = false } = {}) {
  const day = await currentBusinessDay(db, { required });
  if (!day) return null;
  if (required && !allowStale && isStaleBusinessDay(day) && !isStaleAcknowledged(day)) {
    fail('This business day is still open from a previous Nepal date. Continue it or start the next business day before recording new activity.', 409, { code: 'business_day_stale', business_day_id: day.id });
  }
  const session = await activeStoreSession(db, day.id);
  if (!session && required) fail('Reopen the store session before recording shop activity.', 409, { code: 'store_session_required', business_day_id: day.id });
  return session ? day.id : null;
}

/**
 * Attach a late-entered purchase/expense to the calendar date it belongs to.
 * Prefer an existing business_days row; otherwise create a closed historical day
 * so Summary / Cash Position can scope the journal correctly.
 */
export async function businessDayIdForCalendarDate(db, calendarDate, {
  note = 'Historical day created for a late-entered dated record.',
} = {}) {
  await ensureBusinessDaySchema(db);
  const date = businessDateKey(calendarDate || getNepaliDateString());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('Choose a valid date.');
  }
  if (date > getNepaliDateString()) {
    fail('That date cannot be in the future.');
  }

  let currentId = null;
  try {
    currentId = await currentBusinessDayId(db, { required: true, allowStale: true });
  } catch {
    currentId = null;
  }
  if (currentId) {
    const current = await db.get(`SELECT id, business_date FROM business_days WHERE id=?`, [currentId]);
    if (businessDateKey(current?.business_date) === date) return currentId;
  }

  const existing = await db.get(`SELECT id FROM business_days WHERE business_date=?`, [date]);
  if (existing?.id) return existing.id;

  try {
    const inserted = await db.run(
      `INSERT INTO business_days
         (business_date, status, opened_at, closed_at, opening_cash, opening_note)
       VALUES (?, 'closed', ?, ?, 0, ?)`,
      [date, `${date} 00:00:00`, `${date} 23:59:59`, note]
    );
    if (inserted?.lastInsertRowid) return inserted.lastInsertRowid;
  } catch (error) {
    if (!/unique|duplicate/i.test(String(error?.message || error?.code || ''))) throw error;
  }
  return (await db.get(`SELECT id FROM business_days WHERE business_date=?`, [date]))?.id || null;
}

function isHistoricalPlaceholder(day) {
  const note = String(day?.opening_note || '');
  return day?.status === 'closed'
    && day?.opened_by == null
    && day?.closed_by == null
    && Number(day?.opening_cash || 0) === 0
    && !day?.force_closed
    && !day?.closing_snapshot
    && /^Historical (day created|calendar-date backfill)/i.test(note);
}

async function attachDayJournals(db, dayId) {
  await ensureAccountingSchema(db);
  await safe(db.run(`
    UPDATE journal_entries SET business_day_id = ?
    WHERE source_type = 'expense'
      AND source_id IN (SELECT id FROM expenses WHERE business_day_id = ?)`, [dayId, dayId]), null);
  await safe(db.run(`
    UPDATE journal_entries SET business_day_id = ?
    WHERE business_day_id IS NULL AND source_type = 'supplier_payment'
      AND created_at >= (SELECT opened_at FROM business_days WHERE id = ?)`, [dayId, dayId]), null);
}

export async function businessDayContext(db) {
  await ensureBusinessDaySchema(db);
  const current = await currentBusinessDay(db);
  const activeSession = current ? await activeStoreSession(db, current.id) : null;
  const latestSession = current ? await latestStoreSession(db, current.id) : null;
  const previous = await db.get(`
    SELECT bd.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
    FROM business_days bd
    LEFT JOIN users ou ON ou.id = bd.opened_by
    LEFT JOIN users cu ON cu.id = bd.closed_by
    WHERE bd.status = 'closed' ORDER BY bd.business_date DESC, bd.id DESC LIMIT 1`);
  const laterBusinessDay = current ? await db.get(`
    SELECT id,business_date,status,opened_at,closed_at,opening_note
      FROM business_days
     WHERE business_date > ?
     ORDER BY business_date DESC,id DESC LIMIT 1`, [businessDateKey(current.business_date)]) : null;
  const stale = isStaleBusinessDay(current);
  const staleAcknowledged = stale && isStaleAcknowledged(current);
  return {
    current: current ? { ...current, isStale: stale, staleAcknowledged } : null,
    activeSession, latestSession,
    previous: previous ? { ...previous, business_date: businessDateKey(previous.business_date) } : null,
    requiresOpening: !current || !activeSession,
    storeClosed: !!current && !activeSession,
    isStale: stale,
    staleAcknowledged,
    laterBusinessDay: laterBusinessDay ? { ...laterBusinessDay, business_date: businessDateKey(laterBusinessDay.business_date) } : null,
  };
}

async function writeAudit(db, day, action, actor, { previous = null, next = null, reason = null, detail = null } = {}) {
  await db.run(
    `INSERT INTO business_day_audit
     (business_day_id, action, actor_id, actor_name, previous_value, new_value, reason, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [day.id, action, actor?.id || null, actor?.full_name || actor?.username || null,
      previous == null ? null : json(previous), next == null ? null : json(next), reason, detail == null ? null : json(detail)]
  );
}

async function openStoreSession(tx, day, data, actor, { action = 'store_session_opened' } = {}) {
  const latest = await latestStoreSession(tx, day.id);
  const sessionNumber = Number(latest?.session_number || 0) + 1;
  const openingCash = round2(data.opening_cash);
  const priorCash = latest?.counted_cash == null
    ? data.previous_counted_cash == null ? null : round2(data.previous_counted_cash)
    : round2(latest.counted_cash);
  const drawerId = data.drawer_id || (await tx.get(`SELECT id FROM cash_drawers WHERE is_active = 1 ORDER BY id LIMIT 1`))?.id;
  if (priorCash != null && Math.abs(openingCash - priorCash) >= 0.01) {
    await recordOpeningCashMovement(tx, {
      businessDayId: day.id,
      drawerId,
      priorCash,
      openingCash,
      reason: data.opening_cash_reason,
      note: data.opening_cash_note,
      createdBy: actor?.id || null,
      action,
    });
  }
  const drawerSession = await openSession(tx, {
    drawer_id: drawerId || null,
    opening_amount: openingCash,
    opened_by: actor?.id || null,
    note: `Business day ${day.business_date} session ${sessionNumber}${data.opening_note ? `: ${String(data.opening_note).trim()}` : ''}`,
    business_day_id: day.id,
  }, { withinTransaction: true });
  // A zero opening float may not create a journal entry. Keep the nullable
  // FK null in that case; 0 is not a valid journal_entries.id in PostgreSQL.
  const latestJournalId = Number((await tx.get(`SELECT MAX(id) AS id FROM journal_entries`))?.id || 0);
  const openingJournalId = latestJournalId > 0 ? latestJournalId : null;
  const inserted = await tx.run(
    `INSERT INTO business_day_sessions
     (business_day_id, session_number, status, opened_by, opening_cash, opening_note, drawer_session_id, opening_journal_id)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`,
    [day.id, sessionNumber, actor?.id || null, openingCash, String(data.opening_note || '').trim() || null, drawerSession?.id || null, openingJournalId]
  );
  const session = await tx.get(`SELECT * FROM business_day_sessions WHERE id=?`, [inserted.lastInsertRowid]);
  await writeAudit(tx, day, action, actor, {
    next: { status: 'open', session_number: sessionNumber, opening_cash: openingCash },
  });
  return session;
}

async function primaryBankAccountId(tx) {
  const bank = await tx.get(`SELECT id FROM bank_accounts WHERE is_active = 1 ORDER BY id LIMIT 1`);
  if (!bank?.id) fail('Create an active bank account before recording a bank opening-cash movement.');
  return bank.id;
}

async function recordOpeningCashMovement(tx, { businessDayId, drawerId, priorCash, openingCash, reason, note, createdBy, action }) {
  const delta = round2(openingCash - priorCash);
  const abs = Math.abs(delta);
  const cleanReason = String(reason || '').trim();
  const cleanNote = String(note || '').trim();
  if (!OPENING_CASH_REASONS.has(cleanReason)) fail('Choose where the opening cash difference came from or went.');
  if (cleanReason === 'other' && !cleanNote) fail('Add a note for Other opening cash movement.');

  const bankAccountId = ['bank_deposit', 'bank_withdrawal'].includes(cleanReason) ? await primaryBankAccountId(tx) : null;
  const label = {
    cash_reserve: 'Cash Reserve / Safe',
    bank_deposit: 'Bank Deposit',
    bank_withdrawal: 'Bank Withdrawal',
    owner_withdrawal: 'Owner Withdrawal',
    owner_contribution: 'Owner Contribution',
    other: 'Other',
  }[cleanReason];
  const memo = `Opening cash movement - ${label}${cleanNote ? `: ${cleanNote}` : ''}`;
  const contra = (() => {
    if (cleanReason === 'cash_reserve') return { code: '1030' };
    if (cleanReason === 'bank_deposit' || cleanReason === 'bank_withdrawal') return { code: '1020', bank_account_id: bankAccountId };
    if (cleanReason === 'owner_withdrawal' || cleanReason === 'owner_contribution') return { code: '3010' };
    return { code: '3020' };
  })();

  if (delta < 0) {
    await postJournal(tx, {
      memo,
      source_type: 'opening_cash_movement',
      external_ref: `opening-cash:${businessDayId}:${action}:${priorCash}:${openingCash}:${cleanReason}`,
      created_by: createdBy,
      business_day_id: businessDayId,
      lines: [
        { ...contra, debit: abs, credit: 0, memo: label },
        { code: '1010', debit: 0, credit: abs, drawer_id: drawerId, memo: 'Removed from drawer' },
      ],
    });
  } else {
    await postJournal(tx, {
      memo,
      source_type: 'opening_cash_movement',
      external_ref: `opening-cash:${businessDayId}:${action}:${priorCash}:${openingCash}:${cleanReason}`,
      created_by: createdBy,
      business_day_id: businessDayId,
      lines: [
        { code: '1010', debit: abs, credit: 0, drawer_id: drawerId, memo: 'Added to drawer' },
        { ...contra, debit: 0, credit: abs, memo: label },
      ],
    });
  }

  const actualCash = round2(await accountBalance(tx, '1010', { drawerId }));
  if (Math.abs(actualCash - openingCash) >= 0.01) {
    // Count differences are recorded on close without silently posting variance;
    // align the drawer to the declared opening only after the classified movement.
    const adjust = round2(openingCash - actualCash);
    await postJournal(tx, {
      memo: `Opening count alignment - ${label}${cleanNote ? `: ${cleanNote}` : ''}`,
      source_type: 'opening_cash_alignment',
      external_ref: `opening-cash-align:${businessDayId}:${action}:${actualCash}:${openingCash}:${cleanReason}`,
      created_by: createdBy,
      business_day_id: businessDayId,
      lines: adjust > 0
        ? [
            { code: '1010', debit: Math.abs(adjust), credit: 0, drawer_id: drawerId, memo: 'Opening cash alignment' },
            { code: '3020', debit: 0, credit: Math.abs(adjust), memo: 'Opening balance alignment' },
          ]
        : [
            { code: '3020', debit: Math.abs(adjust), credit: 0, memo: 'Opening balance alignment' },
            { code: '1010', debit: 0, credit: Math.abs(adjust), drawer_id: drawerId, memo: 'Opening cash alignment' },
          ],
    });
  }
}

async function finalizeBusinessDay(tx, day, actor, { reason = null } = {}) {
  const summary = await businessDaySummary(tx, day);
  const latest = await latestStoreSession(tx, day.id);
  const expected = round2(latest?.expected_cash ?? summary.cash.expected_cash);
  const counted = latest?.counted_cash == null ? null : round2(latest.counted_cash);
  const difference = counted == null ? null : round2(counted - expected);
  // Recomputing the operational summary here must not erase the physical note
  // count captured when the store session was closed. The session snapshot is
  // the durable source for reconciliation data; carry it into the finalized
  // business-day snapshot so history and reports can still display it later.
  let reconciliation = null;
  try {
    reconciliation = latest?.closing_snapshot
      ? JSON.parse(latest.closing_snapshot)?.reconciliation || null
      : null;
  } catch { reconciliation = null; }
  const finalSnapshot = reconciliation ? { ...summary, reconciliation } : summary;
  await tx.run(`UPDATE business_days SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?,
    expected_cash=?, counted_cash=?, cash_difference=?, closing_note=COALESCE(closing_note,?),
    closing_snapshot=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'`,
  [actor?.id || null, expected, counted, difference, reason, json(finalSnapshot), day.id]);
  await writeAudit(tx, day, 'business_day_finalized', actor, {
    previous: { status: 'open' },
    next: { status: 'closed', expected_cash: expected, counted_cash: counted, cash_difference: difference },
    reason,
  });
}

export async function openBusinessDay(db, data, actor) {
  await ensureAccountingSchema(db);
  await ensureBusinessDaySchema(db);
  const action = String(data.action || '').trim();
  // The next business day is always today in Nepal. Deriving this on the
  // server avoids browser locale strings (for example 08/15/2026) being
  // compared lexicographically with the stored ISO business date.
  const businessDate = action === 'start_next'
    ? getNepaliDateString()
    : businessDateKey(data.business_date || getNepaliDateString());
  const openingCash = round2(data.opening_cash);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) fail('Choose a valid business date.');
  if (openingCash < 0) fail('Opening cash cannot be negative.');
  if (action !== 'continue_stale' && businessDate > getNepaliDateString()) fail('Business date cannot be in the future.', 400);

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const existing = await tx.get(`SELECT * FROM business_days WHERE status = 'open'${lock}`);
    if (existing) {
      const today = getNepaliDateString();
      const stale = isStaleBusinessDay(existing);

      if (action === 'continue_stale') {
        if (!stale) fail('This business day is not stale.', 409);
        const laterDay = await tx.get(
          `SELECT id,business_date,status FROM business_days WHERE business_date > ? ORDER BY business_date DESC,id DESC LIMIT 1`,
          [businessDateKey(existing.business_date)]
        );
        if (laterDay) {
          fail(`Business Day ${existing.business_date} cannot be continued because a later Business Day ${laterDay.business_date} already exists. Close the old store session and start the current day instead.`, 409, {
            code: 'later_business_day_exists',
            business_day_id: existing.id,
            later_business_day_id: laterDay.id,
            later_business_date: laterDay.business_date,
          });
        }
        if (!data.confirm_continue_stale) fail('Confirm before continuing the stale business day.', 400, { code: 'stale_continue_confirmation_required' });
        const reason = String(data.reason || '').trim();
        if (!reason) fail('A reason is required to continue a stale business day.', 400);
        await tx.run(`UPDATE business_days SET stale_ack_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [today, existing.id]);
        const updated = await tx.get(`SELECT * FROM business_days WHERE id=?`, [existing.id]);
        await writeAudit(tx, updated, 'business_day_stale_acknowledged', actor, { reason, next: { stale_ack_date: today } });
        const session = await activeStoreSession(tx, existing.id);
        return { ...updated, active_session: session, stale_acknowledged: true };
      }

      if (stale && action !== 'start_next' && !isStaleAcknowledged(existing)) {
        fail('This business day is still open from a previous Nepal date. Continue it or start the next business day.', 409, {
          code: 'business_day_stale', business_day_id: existing.id, business_date: existing.business_date,
        });
      }

      const session = await activeStoreSession(tx, existing.id);
      if (session) fail('A store session is already open. Close it before opening another.', 409);
      if (action === 'start_next') {
        if (!data.confirm_next_day) fail('Confirm before starting the next business day.', 400, { code: 'next_business_day_confirmation_required' });
        if (businessDate <= businessDateKey(existing.business_date)) {
          fail('Choose a later business date for the next business day.', 400);
        }
        await finalizeBusinessDay(tx, existing, actor, { reason: 'Started next business day.' });
      } else {
        if (businessDate !== businessDateKey(existing.business_date)) {
          fail('Reopen the current business day or confirm starting the next business day.', 409, {
            code: 'business_day_still_current',
            current_business_date: existing.business_date,
          });
        }
        const reopened = await openStoreSession(tx, existing, data, actor, { action: 'store_session_reopened' });
        return { ...existing, active_session: reopened, reopened: true };
      }
    }

    const sameDate = await tx.get(`SELECT * FROM business_days WHERE business_date = ?${lock}`, [businessDate]);
    if (sameDate && businessDate === getNepaliDateString() && isHistoricalPlaceholder(sameDate)) {
      // A dated expense may have reserved today's calendar date before the shop
      // opened. Promote that synthetic row in-place so attached history keeps
      // its business_day_id and today remains openable exactly once.
      await tx.run(
        `DELETE FROM business_day_sessions
          WHERE business_day_id=? AND opened_by IS NULL AND closed_by IS NULL
            AND drawer_session_id IS NULL AND opening_journal_id IS NULL
            AND opening_note LIKE 'Historical %'`,
        [sameDate.id]
      );
      await tx.run(
        `UPDATE business_days SET status='open', opened_at=CURRENT_TIMESTAMP, opened_by=?,
          opening_cash=?, opening_note=?, closed_at=NULL, closed_by=NULL,
          expected_cash=NULL, counted_cash=NULL, cash_difference=NULL, closing_note=NULL,
          force_closed=0, force_close_reason=NULL, approved_by=NULL, closing_snapshot=NULL,
          stale_ack_date=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [actor?.id || null, openingCash, String(data.opening_note || '').trim() || null, sameDate.id]
      );
      const promoted = await tx.get(`SELECT * FROM business_days WHERE id=?`, [sameDate.id]);
      const previousClosed = await tx.get(`SELECT * FROM business_days WHERE status='closed' AND id<>? ORDER BY business_date DESC,id DESC LIMIT 1`, [promoted.id]);
      const previousSession = previousClosed ? await latestStoreSession(tx, previousClosed.id) : null;
      const session = await openStoreSession(tx, promoted, {
        ...data,
        previous_counted_cash: previousSession?.counted_cash ?? previousClosed?.counted_cash ?? null,
      }, actor, { action: 'business_day_opened_from_historical_placeholder' });
      await writeAudit(tx, promoted, 'historical_placeholder_promoted', actor, {
        previous: { status: 'closed', opening_note: sameDate.opening_note },
        next: { status: 'open', business_date: businessDate, opening_cash: openingCash },
      });
      return { ...promoted, active_session: session, promoted_historical_placeholder: true };
    }
    if (sameDate) {
      const latest = await tx.get(`SELECT business_date FROM business_days ORDER BY business_date DESC LIMIT 1`);
      const suggestedDate = addDays(latest?.business_date || businessDate, 1);
      fail(`That business date already exists in history. Open ${suggestedDate} instead.`, 409, {
        code: 'business_date_exists',
        suggested_business_date: suggestedDate,
      });
    }
    const inserted = await tx.run(
      `INSERT INTO business_days (business_date, status, opened_by, opening_cash, opening_note)
       VALUES (?, 'open', ?, ?, ?)`,
      [businessDate, actor?.id || null, openingCash, String(data.opening_note || '').trim() || null]
    );
    const day = await tx.get(`SELECT * FROM business_days WHERE id = ?`, [inserted.lastInsertRowid]);
    const previousClosed = await tx.get(`SELECT * FROM business_days WHERE status='closed' AND id<>? ORDER BY business_date DESC,id DESC LIMIT 1`, [day.id]);
    const previousSession = previousClosed ? await latestStoreSession(tx, previousClosed.id) : null;
    const session = await openStoreSession(tx, {
      ...day,
    }, { ...data, previous_counted_cash: previousSession?.counted_cash ?? previousClosed?.counted_cash ?? null }, actor, { action: 'store_session_opened' });
    await writeAudit(tx, day, 'business_day_opened', actor, {
      next: { status: 'open', business_date: businessDate, opening_cash: openingCash },
    });
    return { ...day, active_session: session };
  });
}

export async function closingBlockers(db, dayId) {
  const [openSessions, foreignSessions] = await Promise.all([
    db.get(`SELECT COUNT(*) AS n FROM drawer_sessions WHERE business_day_id=? AND status='open'`, [dayId]),
    db.get(`SELECT COUNT(*) AS n FROM drawer_sessions WHERE status='open' AND COALESCE(business_day_id,0)<>?`, [dayId]),
  ]);
  const items = [
    { key: 'multiple_drawers', count: Math.max(0, Number(openSessions?.n || 0) - 1), label: 'additional open drawer sessions', href: '/admin/cash-drawer' },
    { key: 'foreign_drawers', count: Number(foreignSessions?.n || 0), label: 'open drawer sessions from another day', href: '/admin/cash-drawer' },
  ].filter((item) => item.count > 0);
  return { canCloseNormally: items.length === 0, items, openDrawerSessions: Number(openSessions?.n || 0) };
}

export async function businessDaySummary(db, dayOrId) {
  await ensureBusinessDaySchema(db);
  const day = typeof dayOrId === 'object' ? dayOrId : await db.get(`SELECT * FROM business_days WHERE id=?`, [dayOrId]);
  if (!day) fail('Business day not found.', 404);
  let closedSnapshot = null;
  if (day.status === 'closed' && day.closing_snapshot) {
    try { closedSnapshot = JSON.parse(day.closing_snapshot); } catch { /* live fallback for legacy snapshots */ }
  }
  const id = day.id;
  if (!closedSnapshot) await attachDayJournals(db, id);
  const session = await activeStoreSession(db, id) || await latestStoreSession(db, id);
  const cashRange = session
    ? {
        sql: session.opening_journal_id
          ? `AND je.id > ? ${session.closed_at ? 'AND je.created_at <= ?' : ''}`
          : `AND je.created_at >= ? ${session.closed_at ? 'AND je.created_at <= ?' : ''}`,
        params: session.opening_journal_id
          ? (session.closed_at ? [session.opening_journal_id, session.closed_at] : [session.opening_journal_id])
          : (session.closed_at ? [session.opened_at, session.closed_at] : [session.opened_at]),
      }
    : { sql: '', params: [] };
  const cashBusinessDayScope = { sql: 'AND je.business_day_id=?', params: [id] };
  const [expenses, itemTotals, topItems, cashRows, allDayCashRows, postCloseCashSalesRow, onlineRows, sessionStats, blockers, sessions, retailSales, retailReturns, retailPayments] = await Promise.all([
    safe(db.get(`SELECT COALESCE(SUM(amount),0) AS operating,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_method,'cash'))='cash' THEN amount ELSE 0 END),0) AS cash,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_method,'cash'))<>'cash' THEN amount ELSE 0 END),0) AS online
      FROM expenses WHERE business_day_id=? AND LOWER(COALESCE(status,'active'))<>'voided'`, [id]), {}),
    safe(db.get(`SELECT COALESCE(SUM(l.quantity),0) AS quantity FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id
      WHERE s.business_day_id=? AND s.status='COMPLETED'`, [id]), {}),
    safe(db.all(`SELECT name, SUM(quantity) AS quantity, COALESCE(SUM(amount),0) AS amount FROM (
      SELECT l.product_name_snapshot || CASE WHEN COALESCE(l.variant_name_snapshot,'') IN ('','Standard') THEN '' ELSE ' · ' || l.variant_name_snapshot END AS name,
             l.quantity AS quantity, l.quantity*l.unit_price AS amount
        FROM retail_sale_lines l JOIN retail_sales s ON s.id=l.retail_sale_id
        WHERE s.business_day_id=? AND s.status='COMPLETED'
      ) items GROUP BY name ORDER BY quantity DESC LIMIT 5`, [id]), []),
    db.all(`SELECT COALESCE(je.source_type,'other') AS source_type, je.memo,
      original.source_type AS reversed_source_type,
      COALESCE(SUM(jl.debit),0) AS cash_in, COALESCE(SUM(jl.credit),0) AS cash_out
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id
      LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
      WHERE a.code='1010' ${cashBusinessDayScope.sql}
        ${cashRange.sql}
        AND COALESCE(je.source_type,'') NOT IN ('drawer_open','drawer','opening_cash_movement','opening_cash_alignment','business_day_close')
      GROUP BY COALESCE(je.source_type,'other'), je.memo, original.source_type`, [...cashBusinessDayScope.params, ...cashRange.params]),
    db.all(`SELECT COALESCE(je.source_type,'other') AS source_type,
      original.source_type AS reversed_source_type,
      COALESCE(SUM(jl.debit),0) AS cash_in, COALESCE(SUM(jl.credit),0) AS cash_out
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id
      LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
      WHERE je.business_day_id=? AND a.code='1010'
        AND COALESCE(je.source_type,'') NOT IN ('drawer_open','drawer','opening_cash_movement','opening_cash_alignment','business_day_close')
      GROUP BY COALESCE(je.source_type,'other'), original.source_type`, [id]),
    session?.closed_at ? db.get(`SELECT COALESCE(SUM(
      CASE WHEN COALESCE(original.source_type,je.source_type,'')='retail_sale'
        THEN jl.debit-jl.credit ELSE 0 END),0) AS amount
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id
      LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
      WHERE je.business_day_id=? AND a.code='1010' AND je.created_at>?`, [id, session.closed_at]) : Promise.resolve({ amount: 0 }),
    db.all(`SELECT a.code, a.name,
      COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.credit ELSE jl.debit END),0) AS inflow,
      COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.debit ELSE jl.credit END),0) AS outflow
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id
      LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
      JOIN accounts a ON a.id=jl.account_id
      WHERE je.business_day_id=? AND a.code IN ('1020','1100','1110','1120','1130','1140')
      GROUP BY a.code,a.name ORDER BY a.code`, [id]),
    db.get(`SELECT COUNT(*) AS sessions, MAX(session_number) AS session_number
      FROM business_day_sessions WHERE business_day_id=?`, [id]),
    closingBlockers(db, id),
    listBusinessDaySessions(db, id),
    safe(db.get(`SELECT COUNT(*) AS sales,COALESCE(SUM(grand_total),0) AS gross,COALESCE(SUM(discount_amount),0) AS discounts,
      COALESCE(SUM(tax_amount),0) AS tax,COALESCE(SUM(amount_due),0) AS open_credit
      FROM retail_sales WHERE business_day_id=? AND status='COMPLETED'`, [id]), {}),
    safe(db.get(`SELECT COUNT(*) AS returns,COALESCE(SUM(refund_total),0) AS refunds
      FROM retail_returns WHERE business_day_id=? AND status='POSTED'`, [id]), {}),
    safe(db.all(`SELECT LOWER(p.method) AS method,COALESCE(SUM(p.amount),0) AS amount
      FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id
      WHERE s.business_day_id=? AND s.status='COMPLETED' GROUP BY LOWER(p.method)`, [id]), []),
  ]);

  const cashBreakdown = { opening_cash: round2(session?.opening_cash ?? day.opening_cash), cash_collections: 0, credit_collections: 0,
    cash_in: 0, business_funding_in: 0, cash_expenses: 0, cash_refunds: 0, supplier_payments: 0, cash_withdrawals: 0,
    money_exchange_in: 0, money_exchange_out: 0, void_returns: 0, other_cash_out: 0 };
  for (const row of cashRows || []) {
    const source = String(row.source_type || 'other');
    const incoming = round2(row.cash_in);
    const outgoing = round2(row.cash_out);
    if (source === 'retail_sale') cashBreakdown.cash_collections += incoming - outgoing;
    else if (source === 'retail_credit_collection') cashBreakdown.credit_collections += incoming - outgoing;
    else if (source === 'expense') cashBreakdown.cash_expenses += outgoing - incoming;
    else if (source === 'retail_return') cashBreakdown.cash_refunds += outgoing - incoming;
    else if (source === 'supplier_payment') cashBreakdown.supplier_payments += outgoing - incoming;
    else if (source === 'business_funding_use') cashBreakdown.business_funding_in += incoming - outgoing;
    else if (source === 'reversal') {
      const reversedSource = String(row.reversed_source_type || 'other');
      if (reversedSource === 'retail_credit_collection') cashBreakdown.credit_collections += incoming - outgoing;
      else if (reversedSource === 'retail_sale') cashBreakdown.void_returns += outgoing - incoming;
      else if (reversedSource === 'retail_return') cashBreakdown.cash_refunds += outgoing - incoming;
      else if (reversedSource === 'expense') cashBreakdown.cash_expenses += outgoing - incoming;
      else if (reversedSource === 'supplier_payment') cashBreakdown.supplier_payments += outgoing - incoming;
      else if (reversedSource === 'business_funding_use') cashBreakdown.business_funding_in += incoming - outgoing;
      else if (reversedSource === 'cash_movement') {
        if (outgoing > incoming) cashBreakdown.cash_in -= outgoing - incoming;
        else if (incoming > outgoing) cashBreakdown.other_cash_out -= incoming - outgoing;
      }
      else if (reversedSource === 'exchange') {
        if (outgoing > incoming) cashBreakdown.money_exchange_in -= outgoing - incoming;
        else if (incoming > outgoing) cashBreakdown.money_exchange_out -= incoming - outgoing;
      }
      else if (incoming > outgoing) cashBreakdown.cash_in += incoming - outgoing;
      else if (outgoing > incoming) cashBreakdown.other_cash_out += outgoing - incoming;
    }
    else if (source === 'cash_movement') {
      if (incoming > outgoing) cashBreakdown.cash_in += incoming - outgoing;
      else if (outgoing > incoming) cashBreakdown.other_cash_out += outgoing - incoming;
    }
    else if (source === 'exchange') {
      if (incoming > outgoing) cashBreakdown.money_exchange_in += incoming - outgoing;
      else if (outgoing > incoming) cashBreakdown.money_exchange_out += outgoing - incoming;
    }
    else {
      if (incoming > outgoing) cashBreakdown.cash_in += incoming - outgoing;
      else if (outgoing > incoming) cashBreakdown.other_cash_out += outgoing - incoming;
    }
  }
  for (const key of Object.keys(cashBreakdown)) cashBreakdown[key] = round2(cashBreakdown[key]);
  const movementNet = round2((cashRows || []).reduce((sum, row) => sum + Number(row.cash_in || 0) - Number(row.cash_out || 0), 0));
  const expectedCash = round2(Number(cashBreakdown.opening_cash || 0) + movementNet);
  if (expectedCash < -0.009) {
    blockers.items.push({
      key: 'negative_expected_cash',
      count: 1,
      label: 'cash-source correction required',
      message: `Expected drawer cash is Rs ${Math.abs(expectedCash).toFixed(2)} below zero. Correct any cash expense or purchase paid from Business Funding / Owner Pocket, or record the missing cash-in.`,
      href: '/admin/expenses',
    });
    blockers.canCloseNormally = false;
  }
  const bucketMethods = { cash: 0, digital: 0, credit: 0 };
  for (const row of retailPayments || []) {
    const bucket = paymentBucket(row.method);
    if (bucket in bucketMethods) bucketMethods[bucket] += Number(row.amount || 0);
  }
  const methods = { cash: round2(bucketMethods.cash), online: round2(bucketMethods.digital), credit: round2(bucketMethods.credit) };
  const dayCashBySource = (allDayCashRows || []).reduce((totals, row) => {
    const source = String(row.source_type || 'other');
    const effectiveSource = source === 'reversal' ? String(row.reversed_source_type || 'other') : source;
    const net = Number(row.cash_in || 0) - Number(row.cash_out || 0);
    if (effectiveSource === 'retail_sale') totals.sales += net;
    else if (effectiveSource === 'retail_credit_collection') totals.credit += net;
    return totals;
  }, { sales: 0, credit: 0 });
  const dayCreditCollections = round2(dayCashBySource.credit);
  const dayCashSales = round2(dayCashBySource.sales);
  const cashSalesOutsideSession = round2(dayCashSales - Number(cashBreakdown.cash_collections || 0));
  const postCloseCashSales = round2(postCloseCashSalesRow?.amount);
  const earlierSessionCashSales = round2(cashSalesOutsideSession - postCloseCashSales);
  const totalCollected = round2(methods.cash + methods.online);
  const itemsSold = Number(itemTotals?.quantity || 0);

  const refundTotal = round2(retailReturns?.refunds);
  const summary = {
    business_day: day,
    retail: { completed_sales: Number(retailSales?.sales || 0), gross_sales: round2(retailSales?.gross),
      discounts: round2(retailSales?.discounts), tax: round2(retailSales?.tax),
      open_credit: round2(retailSales?.open_credit), posted_returns: Number(retailReturns?.returns || 0),
      refunds: refundTotal, net_sales: round2(Number(retailSales?.gross || 0) - refundTotal),
      payments: (retailPayments || []).map((row) => ({ method: row.method, amount: round2(row.amount) })) },
    store_session: session || null,
    sales: { items_sold: itemsSold },
    collections: { methods, cash: methods.cash, cash_sales: dayCashSales, cash_credit_collections: dayCreditCollections, online: methods.online,
      credit_sales: methods.credit, total_collected: totalCollected,
      refunds: refundTotal, void_returns: round2(cashBreakdown.void_returns), net_collected: round2(totalCollected-refundTotal) },
    cash: { expected_cash: expectedCash, breakdown: cashBreakdown, ledger_movement: movementNet,
      scope: session ? 'store_session' : 'business_day',
      session_number: Number(session?.session_number || sessionStats?.session_number || 0),
      session_count: Number(sessionStats?.sessions || 0),
      business_day_cash_sales: dayCashSales,
      cash_sales_outside_session: cashSalesOutsideSession,
      earlier_session_cash_sales: earlierSessionCashSales,
      post_close_cash_sales: postCloseCashSales },
    sessions: sessions || [],
    online: (onlineRows || []).map((row) => ({ ...row, inflow: round2(row.inflow), outflow: round2(row.outflow), net: round2(Number(row.inflow)-Number(row.outflow)) })),
    outflows: { operating_expenses: round2(expenses?.operating), cash_expenses: round2(expenses?.cash), online_expenses: round2(expenses?.online),
      refunds: refundTotal, cash_void_returns: round2(cashBreakdown.void_returns) },
    operations: { top_items: (topItems || []).map((row) => ({ ...row, quantity: Number(row.quantity || 0), amount: round2(row.amount) })) },
    blockers,
  };
  if (!closedSnapshot) return summary;

  const adjustment = await db.get(
    `SELECT COUNT(DISTINCT r.id) AS entries,
            COALESCE(SUM(jl.debit-jl.credit),0) AS cash_delta
     FROM journal_entries r
     LEFT JOIN journal_entries original ON original.id=r.source_id
     JOIN journal_lines jl ON jl.journal_id=r.id
     JOIN accounts a ON a.id=jl.account_id
     WHERE a.code='1010' AND (
       (r.source_type='reversal' AND original.business_day_id=?
         AND (COALESCE(r.business_day_id,0)<>? OR r.created_at>?))
       OR
       (r.source_type IN ('expense','expense_payment_method_correction','expense_edit_correction')
         AND r.business_day_id=? AND r.created_at>?)
     )`,
    [day.id, day.id, day.closed_at, day.id, day.closed_at]
  ).catch(() => ({ entries: 0, cash_delta: 0 }));
  const originalExpected = round2(closedSnapshot?.cash?.expected_cash ?? summary.cash.expected_cash);
  const cashDelta = round2(adjustment?.cash_delta);
  const adjustedExpected = round2(originalExpected + cashDelta);
  const counted = closedSnapshot?.reconciliation?.counted_cash ?? day.counted_cash;
  return {
    ...summary,
    cash: { ...summary.cash, original_expected_cash: originalExpected, adjusted_expected_cash: adjustedExpected },
    post_close_adjustments: { entries: Number(adjustment?.entries || 0), cash_delta: cashDelta },
    reconciliation: {
      ...closedSnapshot.reconciliation,
      original_difference: closedSnapshot?.reconciliation?.difference ?? day.cash_difference,
      adjusted_difference: counted == null ? null : round2(Number(counted) - adjustedExpected),
    },
  };
}

export async function closeBusinessDay(db, data, actor, { force = false, now = new Date() } = {}) {
  if (force && actor?.role !== 'admin') fail('Only administrators can force close.', 403);
  assertCashClosingAllowed(actor, now);
  await ensureBusinessDaySchema(db);
  const counted = round2(data.counted_cash);
  if (data.counted_cash === '' || data.counted_cash == null || counted < 0) fail('Enter the physical cash counted in the drawer.');
  const cashDenominations = normalizeCashDenominations(data.cash_denominations, counted);
  const reason = String(data.force_close_reason || '').trim();
  if (force && !reason) fail('A reason is required to force close the business day.');

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const day = await tx.get(`SELECT * FROM business_days WHERE status='open' ORDER BY id DESC LIMIT 1${lock}`);
    if (!day) fail('There is no open business day to close.', 409);
    const session = await activeStoreSession(tx, day.id);
    if (!session) fail('There is no open store session to close.', 409, { code: 'store_session_closed', business_day_id: day.id });
    const summary = await businessDaySummary(tx, day);
    if (!force && !summary.blockers.canCloseNormally) {
      fail('Resolve the open shop activity before closing normally.', 409, { code: 'business_day_blocked', blockers: summary.blockers });
    }
    const expected = round2(summary.cash.expected_cash);
    const difference = round2(counted - expected);
    const closingNote = String(data.closing_note || '').trim();
    if (Math.abs(difference) >= 0.01 && !closingNote) {
      fail('A closing note is required when counted cash does not match expected cash.', 422, {
        code: 'closing_note_required', expected_cash: expected, counted_cash: counted, cash_difference: difference,
      });
    }
    const snapshot = { ...summary, reconciliation: {
      expected_cash: expected, counted_cash: counted, difference,
      cash_denominations: cashDenominations,
    } };

    // Align ledger cash to the physical count so GL, drawer, and P&L stay in sync.
    const openSessions = await tx.all(`SELECT * FROM drawer_sessions WHERE business_day_id=? AND status='open' ORDER BY id`, [day.id]);
    const drawerSession = openSessions.length === 1 ? openSessions[0] : null;
    if (drawerSession) {
      await tx.run(`UPDATE drawer_sessions SET status='closed', expected_amount=?, counted_amount=?, difference=?,
        closed_by=?, closed_at=CURRENT_TIMESTAMP, note=COALESCE(?,note) WHERE id=?`,
      [expected, counted, difference, actor?.id || null, String(data.closing_note || '').trim() || null, drawerSession.id]);
    }
    if (Math.abs(difference) >= 0.01) {
      await ensureAccountingSchema(tx);
      const drawerId = drawerSession?.drawer_id
        || (await tx.get(
          `SELECT drawer_id FROM drawer_sessions WHERE business_day_id=? ORDER BY opened_at,id LIMIT 1`,
          [day.id]
        ))?.drawer_id
        || null;
      const abs = Math.abs(difference);
      const cashLine = difference > 0
        ? { code: '1010', debit: abs, credit: 0, drawer_id: drawerId }
        : { code: '1010', debit: 0, credit: abs, drawer_id: drawerId };
      const varianceLine = difference > 0
        ? { code: '5060', debit: 0, credit: abs }
        : { code: '5060', debit: abs, credit: 0 };
      await postJournal(tx, {
        entry_date: businessDateKey(day.business_date),
        memo: `Business day close ${day.business_date} — cash ${difference > 0 ? 'over' : 'short'}`,
        source_type: 'business_day_close',
        source_id: session.id,
        external_ref: `business-day-close:${day.id}:${session.id}`,
        created_by: actor?.id || null,
        business_day_id: day.id,
        lines: [cashLine, varianceLine],
      });
    }
    await tx.run(`UPDATE business_day_sessions SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?,
      expected_cash=?, counted_cash=?, cash_difference=?, closing_note=?, force_closed=?, force_close_reason=?,
      closing_snapshot=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'`,
    [actor?.id || null, expected, counted, difference, String(data.closing_note || '').trim() || null,
      force ? 1 : 0, force ? reason : null, json(snapshot), session.id]);
    await tx.run(`UPDATE business_days SET expected_cash=?, counted_cash=?, cash_difference=?,
      closing_note=?, force_closed=?, force_close_reason=?, closing_snapshot=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='open'`,
    [expected, counted, difference, String(data.closing_note || '').trim() || null,
      force ? 1 : 0, force ? reason : null, json(snapshot), day.id]);
    await writeAudit(tx, day, force ? 'store_session_force_closed' : 'store_session_closed', actor, {
      previous: { status: 'open' },
      next: { status: 'closed', session_number: session.session_number, expected_cash: expected, counted_cash: counted, cash_difference: difference },
      reason: force ? reason : null,
      detail: { blockers: summary.blockers.items, cash_denominations: cashDenominations },
    });
    return { ...snapshot, business_day: { ...day, expected_cash: expected, counted_cash: counted,
      cash_difference: difference, force_closed: force ? 1 : 0, force_close_reason: force ? reason : null },
      store_session: { ...session, status: 'closed', closed_at: new Date().toISOString(), closed_by: actor?.id || null,
        expected_cash: expected, counted_cash: counted, cash_difference: difference,
        closing_note: closingNote || null, force_closed: force ? 1 : 0, force_close_reason: force ? reason : null } };
  });
}

export async function listBusinessDays(db, { page = 1, pageSize = 25 } = {}) {
  await ensureBusinessDaySchema(db);
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(10, Number(pageSize) || 25));
  const total = Number((await db.get(`SELECT COUNT(*) AS n FROM business_days`))?.n || 0);
  const rows = await db.all(`SELECT bd.*,
      COALESCE(s.opened_at,bd.opened_at) AS opened_at,
      COALESCE(s.closed_at,bd.closed_at) AS closed_at,
      COALESCE(s.opening_cash,bd.opening_cash) AS opening_cash,
      COALESCE(s.expected_cash,bd.expected_cash) AS expected_cash,
      COALESCE(s.counted_cash,bd.counted_cash) AS counted_cash,
      COALESCE(s.cash_difference,bd.cash_difference) AS cash_difference,
      COALESCE(s.closing_note,bd.closing_note) AS closing_note,
      COALESCE(s.closing_snapshot,bd.closing_snapshot) AS closing_snapshot,
      COALESCE(sou.full_name,ou.full_name) AS opened_by_name,
      COALESCE(scu.full_name,cu.full_name) AS closed_by_name
    FROM business_days bd
    LEFT JOIN business_day_sessions s ON s.business_day_id=bd.id
      AND s.session_number=(SELECT MAX(s2.session_number) FROM business_day_sessions s2 WHERE s2.business_day_id=bd.id)
    LEFT JOIN users ou ON ou.id=bd.opened_by LEFT JOIN users cu ON cu.id=bd.closed_by
    LEFT JOIN users sou ON sou.id=s.opened_by LEFT JOIN users scu ON scu.id=s.closed_by
    ORDER BY bd.business_date DESC, bd.id DESC LIMIT ${size} OFFSET ${(p-1)*size}`);
  return { rows, pagination: { page: p, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total/size)) } };
}

export async function businessDayDetail(db, id) {
  await ensureBusinessDaySchema(db);
  const day = await db.get(`SELECT bd.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
    FROM business_days bd LEFT JOIN users ou ON ou.id=bd.opened_by LEFT JOIN users cu ON cu.id=bd.closed_by WHERE bd.id=?`, [id]);
  if (!day) fail('Business day not found.', 404);
  const [summary, audit, latestSession] = await Promise.all([
    businessDaySummary(db, day),
    db.all(`SELECT a.*, u.full_name AS actor_full_name FROM business_day_audit a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.business_day_id=? ORDER BY a.created_at DESC,a.id DESC`, [id]),
    latestStoreSession(db, day.id),
  ]);
  // businessDaySummary recomputes live figures and has no reconciliation field;
  // the counted cash + note breakdown recorded at close time only exist in the
  // snapshot. Prefer the latest session because older day finalization code
  // could replace the day-level snapshot while leaving the session copy safe.
  const closingSnapshot = latestSession?.closing_snapshot || day.closing_snapshot;
  if (closingSnapshot) {
    try {
      const reconciliation = JSON.parse(closingSnapshot)?.reconciliation;
      if (reconciliation) summary.reconciliation = reconciliation;
    } catch {}
  }
  return {
    day: latestSession ? {
      ...day,
      opened_at: latestSession.opened_at || day.opened_at,
      closed_at: latestSession.closed_at || day.closed_at,
      opened_by_name: latestSession.opened_by_name || day.opened_by_name,
      closed_by_name: latestSession.closed_by_name || day.closed_by_name,
      opening_cash: latestSession.opening_cash ?? day.opening_cash,
      expected_cash: latestSession.expected_cash ?? day.expected_cash,
      counted_cash: latestSession.counted_cash ?? day.counted_cash,
      cash_difference: latestSession.cash_difference ?? day.cash_difference,
    } : day,
    summary,
    audit,
  };
}
