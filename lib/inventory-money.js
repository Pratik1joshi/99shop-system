/** Monetary allocation uses integer cents and thousandths of a stock unit. */
function scaled(value, digits) {
  let text = String(value ?? 0);
  if (/e/i.test(text)) text = Number(value).toFixed(12);
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new Error('Invalid inventory monetary/quantity value');
  const fraction = (match[3] || '').padEnd(digits + 1, '0');
  let result = BigInt(match[2]) * 10n ** BigInt(digits) + BigInt(fraction.slice(0, digits) || 0);
  if (Number(fraction[digits]) >= 5) result++;
  if (match[1]) result = -result;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Inventory amount exceeds safe range');
  return result;
}
export const cents = value => scaled(value, 2);
export const units = value => scaled(value, 3);
export const money = value => Number(value) / 100;

export function proportionalValue(total, part, whole, { floor = false } = {}) {
  const value = cents(total), numerator = units(part), denominator = units(whole);
  if (value < 0n || numerator < 0n || denominator <= 0n || numerator > denominator) throw new Error('Invalid inventory allocation');
  return money((value * numerator + (floor ? 0n : denominator / 2n)) / denominator);
}

export function allocateValue(total, quantities) {
  const weights = quantities.map(units);
  if (weights.some(q => q < 0n)) throw new Error('Negative allocation quantity');
  const whole = weights.reduce((sum, q) => sum + q, 0n);
  if (whole <= 0n) throw new Error('Allocation needs positive quantity');
  const value = cents(total);
  if (value < 0n) throw new Error('Negative inventory value');
  let cumulative = 0n, allocated = 0n;
  return weights.map(q => {
    cumulative += q;
    const target = value * cumulative / whole;
    const result = target - allocated;
    allocated = target;
    return money(result);
  });
}

export function movementTotal(applied) {
  return money(applied.reduce((sum, entry) => sum + cents(entry.movement.total_cost || 0), 0n));
}

export function summarizeMovements(applied) {
  const total = movementTotal(applied);
  const quantity = applied.reduce((sum, row) => sum + Math.abs(Number(row.movement.quantity)), 0);
  return { ...applied[0], movement: { ...applied[0].movement, total_cost: total, unit_cost: quantity ? total / quantity : 0 } };
}
