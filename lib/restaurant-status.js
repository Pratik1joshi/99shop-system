/**
 * Sale / order lifecycle.
 *
 * Order:  pending -> preparing -> ready -> dining -> awaiting_payment -> completed
 *
 * A retail counter sale goes straight from pending to completed, but the
 * intermediate states stay defined because historical rows still carry them
 * and the billing guards below are shared by every channel.
 */
import { parseDbDate } from '@/lib/time-utils';

export const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  DINING: 'dining',
  /** @deprecated prefer dining — kept for older rows */
  SERVED: 'served',
  AWAITING_PAYMENT: 'awaiting_payment',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const TABLE_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  COOKING: 'cooking',
  READY: 'ready',
  DINING: 'dining',
  AWAITING_PAYMENT: 'awaiting_payment',
  CLEANING: 'cleaning',
  RESERVED: 'reserved',
};

/** Map order status -> table status (while table still linked) */
export function tableStatusFromOrder(orderStatus) {
  switch (orderStatus) {
    case ORDER_STATUS.PENDING:
      return TABLE_STATUS.OCCUPIED;
    case ORDER_STATUS.PREPARING:
      return TABLE_STATUS.COOKING;
    case ORDER_STATUS.READY:
      return TABLE_STATUS.READY;
    case ORDER_STATUS.DINING:
    case ORDER_STATUS.SERVED:
      return TABLE_STATUS.DINING;
    case ORDER_STATUS.AWAITING_PAYMENT:
      return TABLE_STATUS.AWAITING_PAYMENT;
    case ORDER_STATUS.COMPLETED:
    case ORDER_STATUS.CANCELLED:
      return TABLE_STATUS.AVAILABLE;
    default:
      return TABLE_STATUS.OCCUPIED;
  }
}

export function normalizeOrderStatus(status) {
  if (status === ORDER_STATUS.SERVED) return ORDER_STATUS.DINING;
  return status;
}

export function isOpenOrder(status) {
  const s = normalizeOrderStatus(status);
  return ![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED].includes(s);
}

export function canAddItems(status) {
  const s = normalizeOrderStatus(status);
  return ![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.AWAITING_PAYMENT].includes(s);
}

export function canRequestPayment(status) {
  const s = normalizeOrderStatus(status);
  return [ORDER_STATUS.DINING, ORDER_STATUS.READY, ORDER_STATUS.PREPARING, ORDER_STATUS.PENDING].includes(s);
}

export function canCashierBill(status) {
  const s = normalizeOrderStatus(status);
  return [ORDER_STATUS.DINING, ORDER_STATUS.SERVED, ORDER_STATUS.AWAITING_PAYMENT, ORDER_STATUS.READY].includes(s);
}

export const ORDER_STATUS_UI = {
  pending: { label: 'Open', badge: 'bg-sky-100 text-sky-800' },
  preparing: { label: 'In progress', badge: 'bg-orange-100 text-orange-800' },
  ready: { label: 'Ready', badge: 'bg-violet-100 text-violet-800' },
  dining: { label: 'Open', badge: 'bg-blue-100 text-blue-800' },
  served: { label: 'Open', badge: 'bg-blue-100 text-blue-800' },
  awaiting_payment: { label: 'Awaiting Payment', badge: 'bg-amber-100 text-amber-900' },
  completed: { label: 'Paid', badge: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-700' },
};

export function formatElapsed(fromIso) {
  if (!fromIso) return '—';
  const start = parseDbDate(fromIso);
  if (!start) return '—';
  const ms = Date.now() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
