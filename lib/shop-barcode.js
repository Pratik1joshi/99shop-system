/**
 * The shop's own barcode for items that came without one: a 13-digit EAN-13
 * number starting with 2. GS1 keeps the 2xx range for in-store codes, so it can
 * never clash with a maker's barcode, and every till scanner reads it.
 * Works in the browser and on the server (both have crypto.getRandomValues).
 */
export function ean13CheckDigit(twelveDigits) {
  const sum = [...twelveDigits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export function shopBarcode() {
  const body = `2${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(11)), (byte) => byte % 10).join('')}`;
  return body + ean13CheckDigit(body);
}

/** Codes this system made itself: today's numbers and the older INT-… codes. */
export const isShopBarcode = (code) => /^INT-/.test(String(code || '')) || /^2\d{12}$/.test(String(code || ''));
