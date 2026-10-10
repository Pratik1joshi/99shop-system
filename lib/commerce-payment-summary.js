export function paymentSummary(amountDue, payments) {
  const due = Number(amountDue) || 0;
  const allocated = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const cashAllocated = payments.reduce((sum, payment) => sum + (payment.method === 'cash' ? Number(payment.amount) || 0 : 0), 0);
  const cashTendered = payments.reduce((sum, payment) => sum + (payment.method === 'cash' ? Number(payment.cash_tendered) || 0 : 0), 0);
  return { amountDue: due, allocated, cashAllocated, cashTendered,
    otherAllocated: allocated - cashAllocated,
    remaining: Math.max(0, due - allocated), change: Math.max(0, cashTendered - cashAllocated) };
}
