export const warrantyError = (message, status = 400) => Object.assign(new Error(message), { status });
export const CLAIM_FLOW = Object.freeze({
  SUBMITTED: ['AWAITING_ITEM', 'RECEIVED', 'CANCELLED'], AWAITING_ITEM: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['INSPECTION'], INSPECTION: ['APPROVED', 'REJECTED'],
  APPROVED: ['REPAIR_IN_PROGRESS', 'SENT_TO_SUPPLIER', 'READY_FOR_PICKUP'],
  REPAIR_IN_PROGRESS: ['AWAITING_PARTS', 'READY_FOR_PICKUP', 'SENT_TO_SUPPLIER'],
  AWAITING_PARTS: ['REPAIR_IN_PROGRESS'], SENT_TO_SUPPLIER: ['READY_FOR_PICKUP'],
  REJECTED: ['READY_FOR_PICKUP'], READY_FOR_PICKUP: ['RESOLVED'], RESOLVED: ['CLOSED'], CLOSED: [], CANCELLED: [],
});
export const CUSTOMER_CLAIM_STATES = {
  SUBMITTED: 'Request received', AWAITING_ITEM: 'Item needed', RECEIVED: 'Item received', INSPECTION: 'Under review',
  APPROVED: 'Service approved', REJECTED: 'Review completed', REPAIR_IN_PROGRESS: 'Repair in progress',
  AWAITING_PARTS: 'Waiting for parts', SENT_TO_SUPPLIER: 'Waiting for supplier', READY_FOR_PICKUP: 'Ready for pickup',
  RESOLVED: 'Completed', CLOSED: 'Completed', CANCELLED: 'Cancelled',
};
export function warrantyExpiry(start, duration, unit) {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(Number(duration)) || duration < 1 || duration > 3650) throw warrantyError('Invalid warranty duration or start date.');
  if (unit === 'DAYS') date.setUTCDate(date.getUTCDate() + Number(duration));
  else if (unit === 'MONTHS') {
    date.setTime(date.getTime() + 345 * 60000);
    const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + Number(duration));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, end));
    date.setTime(date.getTime() - 345 * 60000);
  } else throw warrantyError('Duration unit must be DAYS or MONTHS.');
  return date.toISOString();
}
export function evaluateWarranty({ snapshot, now = new Date(), customerId, serialValid = true, refunded = false, replaced = false, proof = false }) {
  if (refunded) return 'ALREADY_REFUNDED';
  if (replaced) return 'ALREADY_REPLACED';
  if (!serialValid) return 'INVALID_SERIAL';
  if (!snapshot) return 'MANUAL_REVIEW_REQUIRED';
  if (!snapshot.policy_id) return 'NO_WARRANTY';
  const terms = typeof snapshot.terms === 'string' ? JSON.parse(snapshot.terms) : snapshot.terms;
  if (terms.customer_required && (!customerId || Number(customerId) !== Number(snapshot.customer_id))) return 'PROOF_ISSUE';
  if (terms.proof_required && !proof) return 'PROOF_ISSUE';
  if (terms.serial_required && !snapshot.serial_number) return 'INVALID_SERIAL';
  if (new Date(now) < new Date(snapshot.starts_at)) return 'MANUAL_REVIEW_REQUIRED';
  return new Date(now) >= new Date(snapshot.expires_at) ? 'EXPIRED' : 'COVERED';
}
export function assertClaimTransition(from, to) {
  if (!CLAIM_FLOW[from]?.includes(to)) throw warrantyError(`Cannot move ${from} to ${to}.`, 409);
}
