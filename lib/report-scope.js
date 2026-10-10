/**
 * Shared reporting rules: how payment methods group into cash / digital /
 * credit / funding, and the basis note shown on journal-built reports.
 */

/**
 * Deliberately not an allow-list. `method IN ('cash','qr')` silently reported
 * nothing at all for card, eSewa, Khalti and every other provider. Anything
 * that is not cash, credit or funding is digital.
 */
export const CASH_METHODS = ['cash'];
export const CREDIT_METHODS = ['credit', 'due', 'unpaid', 'on_credit', 'payable'];
export const FUNDING_METHODS = ['owner_pocket', 'business_funding'];

/** Payment bucket for one method. */
export function paymentBucket(method) {
  const m = String(method || '').toLowerCase();
  if (CASH_METHODS.includes(m)) return 'cash';
  if (CREDIT_METHODS.includes(m)) return 'credit';
  if (FUNDING_METHODS.includes(m)) return 'funding';
  return 'digital';
}

export const JOURNAL_BASIS_NOTE =
  'Built from posted accounting journal entries, so it reflects what was booked to the ledger. '
  + 'Small differences from the sales reports are expected where entries were posted or adjusted '
  + 'outside the sales flow.';
