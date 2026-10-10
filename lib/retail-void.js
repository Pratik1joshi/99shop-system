import bcrypt from 'bcryptjs';
import { transactionScope } from '@/lib/db/transaction-scope.js';
import { createReturn, postReturn, getReturnableLines } from '@/lib/retail-returns.js';

/**
 * Quick void for "rang it up wrong" mistakes.
 *
 * A void is a full return posted in one step: every item goes back to sellable
 * stock and the money goes back the way it came, through the same return
 * engine (stock, COGS, VAT and journal reversal) the Return screen uses. The
 * sale itself is never deleted or edited, so reports and the audit trail stay
 * exact. It is limited to a short window after checkout and needs a manager or
 * owner PIN.
 */

export const DEFAULT_VOID_WINDOW_MINUTES = 30;
const REFUND_BY_PAYMENT = { cash: 'cash', online: 'online', store_credit: 'store_credit', credit: 'ar_reduction' };

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function voidWindowMinutes(db) {
  const row = await db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'sale_void_window_minutes'").catch(() => null);
  const value = Number(row?.setting_value);
  return row?.setting_value != null && row.setting_value !== '' && Number.isFinite(value) && value >= 0
    ? Math.min(1440, Math.floor(value))
    : DEFAULT_VOID_WINDOW_MINUTES;
}

/**
 * Pure rule check. `ageMinutes` comes from the database clock, the same clock
 * that stamped completed_at, so server time zones cannot skew it.
 */
export function voidEligibility({ status, payments = [], amountDue = 0, customerId = null }, { ageMinutes, returnsCount, windowMinutes }) {
  if (status !== 'COMPLETED') return { ok: false, reason: 'Only a completed sale can be voided.' };
  if (returnsCount > 0) return { ok: false, reason: 'This sale already has a return. Use Return for anything else.' };
  if (!(windowMinutes > 0)) return { ok: false, reason: 'Quick void is switched off in Settings. Use Return instead.' };
  if (!(ageMinutes <= windowMinutes)) return { ok: false, reason: `Quick void is only allowed within ${windowMinutes} minutes of the sale. Use Return instead.` };
  const methods = [...new Set(payments.filter((p) => Number(p.amount) > 0).map((p) => p.method))];
  if (!methods.length && Number(amountDue) > 0) methods.push('credit');
  if (methods.length !== 1 || !REFUND_BY_PAYMENT[methods[0]]) {
    return { ok: false, reason: 'This sale was paid in more than one way. Use Return to choose how each part is refunded.' };
  }
  const refundMethod = REFUND_BY_PAYMENT[methods[0]];
  if (['ar_reduction', 'store_credit'].includes(refundMethod) && !customerId) {
    return { ok: false, reason: 'This sale has no customer attached. Use Return instead.' };
  }
  return { ok: true, refundMethod, minutesLeft: Math.max(0, Math.floor(windowMinutes - ageMinutes)) };
}

export async function getVoidStatus(db, saleId) {
  const sale = await db.get(
    db.driver === 'postgres'
      ? 'SELECT id, status, customer_id, amount_due, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - completed_at)) / 60 AS age_minutes FROM retail_sales WHERE id = ?'
      : "SELECT id, status, customer_id, amount_due, (julianday('now') - julianday(completed_at)) * 1440 AS age_minutes FROM retail_sales WHERE id = ?",
    [saleId]
  );
  if (!sale) throw bad('Sale not found.', 404);
  const [payments, returns, windowMinutes] = await Promise.all([
    db.all('SELECT method, amount FROM retail_sale_payments WHERE retail_sale_id = ?', [saleId]),
    db.get("SELECT COUNT(*) AS n FROM retail_returns WHERE original_sale_id = ? AND status = 'POSTED'", [saleId]).catch(() => ({ n: 0 })),
    voidWindowMinutes(db),
  ]);
  return {
    windowMinutes,
    ...voidEligibility(
      { status: sale.status, payments, amountDue: sale.amount_due, customerId: sale.customer_id },
      { ageMinutes: Number(sale.age_minutes), returnsCount: Number(returns?.n || 0), windowMinutes }
    ),
  };
}

/** The approving manager or owner, or an error that does not say which part was wrong. */
export async function verifyApprover(db, username, pin) {
  const user = await db.get("SELECT id, full_name, username, role, password_hash FROM users WHERE username = ? AND COALESCE(is_active, 1) = 1", [String(username || '').trim()]);
  let valid = false;
  try { valid = !!user && typeof pin === 'string' && !!pin && bcrypt.compareSync(pin, user.password_hash); } catch { valid = false; }
  if (!valid || !['admin', 'manager'].includes(user.role)) {
    // ponytail: fixed delay per failed attempt; add a per-user lockout if PIN guessing is ever seen in the audit log.
    await new Promise((resolve) => setTimeout(resolve, 700));
    throw bad('A manager or owner username and PIN are needed to void a sale.', 403);
  }
  return { id: user.id, name: user.full_name || user.username };
}

export async function voidSale(db, saleId, { cashierId, approverId, reason, businessDayId = null }) {
  const why = String(reason || '').trim();
  if (why.length < 3) throw bad('Say briefly why the sale is being voided.');
  const status = await getVoidStatus(db, saleId);
  if (!status.ok) throw bad(status.reason, 409);

  return db.transaction(async (raw) => {
    const tx = transactionScope(raw);
    const { lines } = await getReturnableLines(tx, saleId);
    // One return line per original batch, so batch-tracked stock goes back where it came from.
    const returnLines = lines.flatMap((line) => {
      const base = { original_sale_line_id: line.id, condition: 'RESELLABLE', disposition: 'RETURN_TO_SELLABLE', reason: 'Sale voided' };
      if (line.batches.length > 1) return line.batches.filter((b) => b.returnableQuantity > 0).map((b) => ({ ...base, quantity: b.returnableQuantity, batch_id: b.batch_id }));
      return Number(line.returnableQuantity) > 0 ? [{ ...base, quantity: line.returnableQuantity }] : [];
    });
    if (!returnLines.length) throw bad('Nothing on this sale is left to return.', 409);
    const draft = await createReturn(tx, { original_sale_id: saleId, cashierId, reason: `Voided: ${why}`, lines: returnLines });
    const posted = await postReturn(tx, draft.id, { postedBy: approverId, businessDayId, refundMethod: status.refundMethod, idempotencyKey: `void:${saleId}` });
    await tx.run("INSERT INTO retail_sale_audit (retail_sale_id, event, actor_id) VALUES (?, 'VOIDED', ?)", [saleId, approverId]);
    return { retail_return: posted, refund_method: status.refundMethod };
  });
}
