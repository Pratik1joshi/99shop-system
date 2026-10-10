import { createHash } from 'node:crypto';

/** Explicit public projection. Never serialize resolver rules or margin evidence. */
export function publicPrice(price) {
  return price ? { unit_price: Number(price.unit_price), reason: 'Online price' } : null;
}

/** A quote acknowledgement, not payment authority. Always compare to fresh server economics. */
export function quoteFingerprint(quote) {
  const prices = quote.pricing || quote.lines.map(line => ({ ...line.price, ...line }));
  return createHash('sha256').update(JSON.stringify({
    lines: prices.map(line => [Number(line.variant_id), Number(line.quantity), Number(line.unit_price ?? line.price?.unit_price)]).sort((a,b)=>a[0]-b[0]),
    subtotal: Number(quote.subtotal), discount: Number(quote.discount), tax: Number(quote.tax),
    delivery: Number(quote.delivery_charge || 0), total: Number(quote.total),
  })).digest('hex');
}
