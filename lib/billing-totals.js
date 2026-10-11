/**
 * Sale totals from the shop's VAT setting: discount, exclusive VAT and an
 * optional (untaxed) delivery fee for online orders.
 */

export function toPercent(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {number} subtotal
 * @param {{ discountAmount?: number, discountPercent?: number, vatPercent?: number, deliveryFee?: number }} opts
 */
export function calculateBillTotals(subtotal, opts = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const discountPercent = toPercent(opts.discountPercent, 0);
  const requestedDiscount =
    opts.discountAmount != null
      ? Math.max(0, Number(opts.discountAmount) || 0)
      : (sub * discountPercent) / 100;
  const discountAmount = Math.min(sub, requestedDiscount);

  const afterDiscount = Math.max(0, sub - discountAmount);
  const vatPercent = toPercent(opts.vatPercent, 0);
  const deliveryFee = Math.max(0, Number(opts.deliveryFee) || 0);

  const tax = (afterDiscount * vatPercent) / 100;
  // Delivery is a separate, untaxed charge, so the discount and VAT rules
  // cannot change it.
  const total = afterDiscount + tax + deliveryFee;

  return {
    subtotal: sub,
    discount: discountAmount,
    afterDiscount,
    tax,
    taxPercent: vatPercent,
    deliveryFee,
    total,
  };
}

export function parseSettingsRates(settings = {}) {
  return {
    vatPercent: toPercent(settings.vat_percentage ?? settings.vatPercent ?? settings.vat, 0),
  };
}
