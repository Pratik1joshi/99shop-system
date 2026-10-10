import { formatCurrency } from '@/lib/currency';

/**
 * A receipt as a WhatsApp message, for customers who order and chat there.
 * Plain text only (WhatsApp *bold*), no links, so it reads the same on any phone.
 */

/** Nepali mobile numbers are 10 digits starting with 9; add the 977 country code. */
export function whatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (/^9\d{9}$/.test(digits)) return `977${digits}`;
  if (/^977\d{10}$/.test(digits)) return digits;
  return /^\d{11,15}$/.test(digits) ? digits : '';
}

export function receiptMessage(sale, { shopName = '99 Shop by Shahana', date = '' } = {}) {
  const lines = (sale.lines || []).map((line) => {
    const variant = line.variant_name_snapshot && line.variant_name_snapshot !== 'Standard' ? ` (${line.variant_name_snapshot})` : '';
    return `• ${Number(line.quantity)} × ${line.product_name_snapshot}${variant} — ${formatCurrency(line.net_amount)}`;
  });
  const extras = [
    Number(sale.discount_amount) > 0 && `Discount: −${formatCurrency(sale.discount_amount)}`,
    Number(sale.tax_amount) > 0 && `VAT: ${formatCurrency(sale.tax_amount)}`,
    Number(sale.delivery_charge) > 0 && `Delivery: ${formatCurrency(sale.delivery_charge)}`,
  ].filter(Boolean);
  const due = Number(sale.amount_due) > 0 ? [`Still to pay: ${formatCurrency(sale.amount_due)}`] : [];
  return [
    `🎀 *${shopName}*`,
    `Receipt ${sale.sale_number || `#${sale.id}`}${date ? ` · ${date}` : ''}`,
    '',
    ...lines,
    '',
    ...extras,
    `*Total: ${formatCurrency(sale.grand_total)}*`,
    ...due,
    '',
    `Thank you${sale.customer_name ? `, ${sale.customer_name}` : ''}! 💕`,
  ].join('\n');
}

/** wa.me link to the customer when we have their number, otherwise WhatsApp's own contact picker. */
export function receiptWhatsappLink(sale, options = {}) {
  const number = whatsappNumber(sale.customer_phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(receiptMessage(sale, options))}`;
}
