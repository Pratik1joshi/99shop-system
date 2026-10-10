/**
 * Reversals: post the exact opposite of an existing journal through
 * postJournal. A journal can only be reversed once (source_type='reversal',
 * source_id = the original journal id → unique index).
 */

import { postJournal } from './accounting.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const conflict = (m) => Object.assign(new Error(m), { status: 409 });

/** Post the mirror of an existing journal. Debits become credits and vice versa. */
export async function reverseJournal(db, { journal_id, reason, created_by = null, business_day_id = null }) {
  const original = await db.get(`SELECT * FROM journal_entries WHERE id = ?`, [journal_id]);
  if (!original) throw bad('Journal not found.');
  if (original.source_type === 'reversal') throw conflict('That entry is itself a reversal.');
  const already = await db.get(`SELECT id FROM journal_entries WHERE source_type = 'reversal' AND source_id = ?`, [journal_id]);
  if (already) throw conflict('This journal has already been reversed.');

  const lines = await db.all(`SELECT * FROM journal_lines WHERE journal_id = ?`, [journal_id]);
  if (!lines.length) throw bad('Journal has no lines to reverse.');

  const mirror = lines.map((l) => ({
    account_id: l.account_id,
    debit: round2(l.credit),
    credit: round2(l.debit),
    drawer_id: l.drawer_id || null,
    bank_account_id: l.bank_account_id || null,
    supplier_id: l.supplier_id || null,
    customer_id: l.customer_id || null,
    memo: 'reversal',
  }));

  // Runs on the passed db so it composes inside a caller's transaction
  // (e.g. an operational void). Callers that need atomicity wrap it.
  return postJournal(db, {
    memo: `Reversal of #${journal_id}${reason ? ` — ${reason}` : ''}`,
    source_type: 'reversal',
    source_id: journal_id,
    created_by,
    business_day_id,
    lines: mirror,
  });
}
