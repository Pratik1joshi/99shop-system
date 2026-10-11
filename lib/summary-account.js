const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const OPENING_SOURCES = ['drawer_open', 'drawer', 'opening_cash_movement', 'opening_cash_alignment', 'business_day_close'];
const SALES_SOURCES = ['bill', 'bill_supplement', 'credit_collection', 'retail_sale', 'retail_credit_collection'];
const SPENDING_SOURCES = ['purchase', 'expense', 'supplier_payment', 'goods_receipt', 'purchase_return'];
const FUNDING_SOURCES = ['business_funding_use'];
const SALARY_SOURCES = ['payroll', 'salary_advance'];
const SAVINGS_SOURCES = ['savings_deposit', 'savings_deposit_void'];

const netFor = (movements, sources) => round2(sources.reduce(
  (total, source) => total + Number(movements?.[source]?.net || 0),
  0
));

const signedRow = (label, value) => {
  const amount = round2(value);
  return {
    label,
    value: Math.abs(amount),
    sign: amount > 0 ? '+' : amount < 0 ? '-' : '',
    signedValue: amount,
  };
};

/**
 * Owner-facing account roll-up used by the Summary Report.
 *
 * Every journal source is either assigned to a named row or included in
 * "Other Ledger Movements". That invariant matters: the rows between opening
 * and closing must never silently omit a movement while still showing the
 * ledger-derived closing balance.
 */
export function summaryAccountRows(account, { cash = false } = {}) {
  const movements = account?.movements || {};
  const known = new Set([
    ...OPENING_SOURCES, ...SALES_SOURCES, 'refund', 'retail_return', 'reversal',
    ...SPENDING_SOURCES, ...FUNDING_SOURCES, ...SALARY_SOURCES, ...SAVINGS_SOURCES,
    'exchange', 'settlement', 'cash_movement', 'manual',
  ]);

  const cashMovementIn = round2(
    Number(movements.cash_movement?.debit || 0) + Number(movements.manual?.debit || 0)
  );
  const cashMovementOut = round2(
    Number(movements.cash_movement?.credit || 0) + Number(movements.manual?.credit || 0)
  );
  const other = round2(Object.entries(movements).reduce(
    (total, [source, movement]) => known.has(source) ? total : total + Number(movement?.net || 0),
    0
  ));

  const rows = [
    { label: 'Opening Balance', value: round2(account?.opening), sign: '', signedValue: round2(account?.opening) },
    signedRow('Opening Adjustment', netFor(movements, OPENING_SOURCES)),
    signedRow('Sales & Collections', netFor(movements, SALES_SOURCES)),
    signedRow('Refunds & Returns', Number(movements.refund?.net || 0) + Number(movements.retail_return?.net || 0)),
    signedRow('Void Reversals', Number(movements.reversal?.net || 0)),
    signedRow('Purchases, Expenses & Suppliers', netFor(movements, SPENDING_SOURCES)),
    signedRow('Business Funding', netFor(movements, FUNDING_SOURCES)),
    signedRow('Salary & Advances', netFor(movements, SALARY_SOURCES)),
    signedRow('Savings', netFor(movements, SAVINGS_SOURCES)),
    signedRow('Money Exchange', Number(movements.exchange?.net || 0)),
    signedRow('Settlements', Number(movements.settlement?.net || 0)),
  ];

  if (cashMovementIn) rows.push(signedRow(cash ? 'Recorded Cash In' : 'Recorded Transfer In', cashMovementIn));
  if (cashMovementOut) rows.push(signedRow(cash ? 'Recorded Cash Out' : 'Recorded Transfer Out', -cashMovementOut));
  if (other) rows.push(signedRow('Other Ledger Movements', other));

  rows.push({
    label: cash ? 'Closing Cash' : 'Closing Balance',
    value: round2(account?.closing),
    sign: '',
    signedValue: round2(account?.closing),
  });
  return rows;
}

export function recordedCashMovements(account) {
  const movements = account?.movements || {};
  return {
    cash_in: round2(Number(movements.cash_movement?.debit || 0) + Number(movements.manual?.debit || 0)),
    cash_out: round2(Number(movements.cash_movement?.credit || 0) + Number(movements.manual?.credit || 0)),
    deposit: round2(Number(movements.savings_deposit?.credit || 0)),
  };
}

export function summarizeSaleComposition(composition, ledgerTotal) {
  const subtotal = round2(composition?.subtotal);
  const discounts = round2(composition?.discounts);
  const tax = round2(composition?.tax);
  const finalizedTotal = round2(composition?.finalized_total);
  return {
    subtotal,
    discounts,
    tax,
    other_adjustments: round2(finalizedTotal - (subtotal - discounts + tax)),
    finalized_total: finalizedTotal,
    ledger_difference: round2(ledgerTotal - finalizedTotal),
  };
}
