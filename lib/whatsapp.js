/** WhatsApp click-to-chat helpers (wa.me), ported from the restaurant app. Nepal (+977) is assumed for 10-digit local numbers. */

const DEFAULT_COUNTRY_CODE = '977';

export const DEFAULT_REMINDER_MESSAGE = 'Hello {name}, this is a friendly reminder from {shop} that {amount} is due on your account. Thank you!';

export function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  return digits.length >= 11 ? digits : '';
}

/** Replaces {name}, {shop}, {amount}, {days}, {phone}; unknown tokens are left untouched. */
export function fillTemplate(template, vars = {}) {
  return String(template || '').replace(/\{(name|shop|amount|days|phone)\}/g, (_, key) => String(vars[key] ?? ''));
}

export function whatsappLink(phone, message = '') {
  const number = whatsappNumber(phone);
  if (!number) return '';
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function openWhatsapp(phone, message = '') {
  const url = whatsappLink(phone, message);
  if (!url) return false;
  // A 'noopener' feature makes window.open return null even on success, so
  // detach the opener by hand to keep the result meaningful.
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  return Boolean(win);
}
