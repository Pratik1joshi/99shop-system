/**
 * Customer payment reminders for open Retail credit.
 *
 * Balances come from completed Retail sales with amount_due (the same source
 * as Receivables). A reminder row only records that staff opened a WhatsApp
 * chat with the message; delivery happens outside the system.
 */
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailSalesSchema } from '@/lib/retail-sales.js';
import { parseDbDate } from '@/lib/time-utils.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export async function ensureCustomerReminderSchema(db) {
  await ensureRetailSalesSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS customer_payment_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, channel TEXT NOT NULL,
    amount_due REAL NOT NULL, message TEXT NOT NULL, created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

/** Customers with open Retail credit, oldest debt first. */
export async function listReminderCandidates(db, { q = '' } = {}) {
  await ensureCustomerReminderSchema(db);
  const where = [`s.status = 'COMPLETED'`, 's.amount_due > 0.005'];
  const args = [];
  const search = String(q || '').trim().slice(0, 100).toLowerCase();
  if (search) { where.push(`(lower(c.name) LIKE ? OR lower(COALESCE(c.phone,'')) LIKE ?)`); args.push(`%${search}%`, `%${search}%`); }
  const rows = await db.all(
    `SELECT c.id, c.name, c.phone, COUNT(*) AS open_sales, COALESCE(SUM(s.amount_due), 0) AS amount_due,
            MIN(s.completed_at) AS oldest_at,
            (SELECT MAX(r.created_at) FROM customer_payment_reminders r WHERE r.customer_id = c.id) AS last_reminded_at,
            (SELECT COUNT(*) FROM customer_payment_reminders r WHERE r.customer_id = c.id) AS reminder_count
       FROM retail_sales s JOIN customers c ON c.id = s.customer_id
      WHERE ${where.join(' AND ')}
      GROUP BY c.id, c.name, c.phone
      ORDER BY oldest_at ASC, c.id ASC LIMIT 500`,
    args
  );
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    open_sales: Number(row.open_sales),
    amount_due: money(row.amount_due),
    reminder_count: Number(row.reminder_count),
    days_outstanding: row.oldest_at ? Math.max(0, Math.floor((now - parseDbDate(row.oldest_at).getTime()) / 86400000)) : 0,
    last_reminded_at: parseDbDate(row.last_reminded_at)?.toISOString() || null,
  }));
}

/** Record that a reminder was opened; the amount is re-read so it matches the ledger at that moment. */
export async function recordReminder(db, { customerId, message, actorId = null }) {
  await ensureCustomerReminderSchema(db);
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) fail('Choose a customer.');
  const text = String(message || '').trim();
  if (!text) fail('Write the reminder message.');
  if (text.length > 1000) fail('Keep the reminder under 1000 characters.');
  const due = await db.get(
    `SELECT COALESCE(SUM(amount_due), 0) AS amount FROM retail_sales WHERE customer_id = ? AND status = 'COMPLETED' AND amount_due > 0.005`,
    [id]
  );
  if (money(due?.amount) <= 0) fail('This customer has no open Retail credit.', 409);
  const result = await db.run(
    `INSERT INTO customer_payment_reminders (customer_id, channel, amount_due, message, created_by) VALUES (?, 'whatsapp', ?, ?, ?)`,
    [id, money(due.amount), text, actorId]
  );
  return { id: result.lastInsertRowid, customer_id: id, amount_due: money(due.amount) };
}
