import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatCurrencyShort } from '../../lib/currency.js';

test('rupees use Nepali lakh grouping and two decimals', () => {
  assert.equal(formatCurrency(647), 'Rs 647.00');
  assert.equal(formatCurrency(1644), 'Rs 1,644.00');
  assert.equal(formatCurrency('125000.5'), 'Rs 1,25,000.50');
  assert.equal(formatCurrencyShort(99.6), 'Rs 100');
});

test('missing amounts show zero instead of NaN', () => {
  assert.equal(formatCurrency(undefined), 'Rs 0.00');
  assert.equal(formatCurrency(null), 'Rs 0.00');
});
