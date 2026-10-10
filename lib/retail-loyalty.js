/**
 * Retail loyalty points — a reward program, deliberately NOT a financial
 * liability account (spec explicit: never post points to Store Credit
 * Liability, or any GL account at all). An immutable
 * `loyalty_transactions` ledger is the source of truth; `customers.
 * loyalty_points_balance` is a locking/fast-read cache only, exactly the
 * same pattern lib/retail-store-credit.js already established for store
 * credit — every write updates both in the same transaction.
 *
 * ── WHY REDEMPTION IS A DISCOUNT, NOT A "PAYMENT METHOD" ──────────────────
 * Store credit redemption is a real liability settling itself — it needs its
 * own Dr 2030 journal leg. Loyalty points have no such liability: redeeming
 * them is economically identical to the business giving a discount (it
 * forgoes revenue, nothing is "paid" from anywhere). So redemption is wired
 * into lib/retail-sales.js exactly like the header discount_amount — it
 * reduces the sale total BEFORE payment allocation, with no separate
 * payment row and no separate journal leg. This keeps the two concepts
 * (spec §15) structurally impossible to confuse: store credit is money the
 * business owes; loyalty points are a reward the business may choose to
 * give away.
 *
 * ── EARNING POLICY (documented, not silently assumed) ──────────────────────
 * Points are earned on the NET amount after discount, EXCLUDING tax — tax
 * collected is never the business's revenue, so it is never a basis for a
 * reward. Rate is configurable via system_settings
 * (loyalty_earn_rate_amount = Rs per 1 point, default 100).
 *
 * ── RETURNS ─────────────────────────────────────────────────────────────
 * Returning merchandise reverses the proportionate share of points EARNED
 * on that original sale (refund value / original sale's post-discount
 * subtotal), written as a REVERSAL transaction, clamped so a customer's
 * balance is never driven negative by a return (if they already spent the
 * points elsewhere — a documented limitation, not silently wrong).
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const TRANSACTION_TYPES = ['EARN', 'REDEEM', 'ADJUSTMENT', 'EXPIRY', 'REVERSAL'];
export async function ensureLoyaltySettingsAudit(db) {
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_loyalty_settings_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,old_value TEXT NOT NULL,new_value TEXT NOT NULL,
    actor_id INTEGER,changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}
const DEFAULT_TIERS = [
  { name: 'STANDARD', threshold: 0, multiplier: 1 },
  { name: 'SILVER', threshold: 20000, multiplier: 1.25 },
  { name: 'GOLD', threshold: 50000, multiplier: 1.5 },
  { name: 'VIP', threshold: 150000, multiplier: 2 },
];

export async function ensureRetailLoyaltySchema(db) {
  await ensureColumn(db, 'customers', 'loyalty_points_balance', 'NUMERIC(14,2) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'customers', 'loyalty_tier_override', 'TEXT');
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    points NUMERIC(14,2) NOT NULL,
    balance_after NUMERIC(14,2) NOT NULL,
    source_type TEXT,
    source_id INTEGER,
    reason TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function getSetting(db, key, fallback) {
  const row = await db.get(`SELECT setting_value FROM system_settings WHERE setting_key = ?`, [key]);
  return row?.setting_value != null ? row.setting_value : fallback;
}

/** Rs per point earned, points per Rs redeemed, and the tier thresholds — all configurable, none hardcoded blindly. */
export async function getLoyaltySettings(db) {
  const earnRateAmount = Number(await getSetting(db, 'loyalty_earn_rate_amount', '100')) || 100; // Rs 100 spend = 1 point
  const pointsPerCurrency = Number(await getSetting(db, 'loyalty_points_per_currency', '10')) || 10; // 10 points = Rs 1
  const redeemMaxPercent = Number(await getSetting(db, 'loyalty_redeem_max_percent', '100')) || 100;
  const enabled = String(await getSetting(db, 'loyalty_enabled', '1')) !== '0';
  return { earnRateAmount, pointsPerCurrency, redeemMaxPercent, enabled, tiers: DEFAULT_TIERS };
}

/** Tier is manual-override-first, else computed from lifetime spend — no behavioral scoring. */
export async function getCustomerTier(db, customerId) {
  const settings = await getLoyaltySettings(db);
  const customer = await db.get(`SELECT total_spent, loyalty_tier_override FROM customers WHERE id = ?`, [customerId]);
  if (!customer) return null;
  if (customer.loyalty_tier_override) return customer.loyalty_tier_override;
  const spent = Number(customer.total_spent || 0);
  let tier = settings.tiers[0].name;
  for (const t of settings.tiers) if (spent >= t.threshold) tier = t.name;
  return tier;
}

async function lockCustomer(db, customerId) {
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  const row = await db.get(`SELECT id, loyalty_points_balance FROM customers WHERE id = ?${lock}`, [customerId]);
  if (!row) throw bad('Customer not found.', 404);
  return row;
}

async function writeTransaction(db, { customerId, type, points, newBalance, sourceType, sourceId, reason, createdBy }) {
  await db.run(`UPDATE customers SET loyalty_points_balance = ? WHERE id = ?`, [newBalance, customerId]);
  await db.run(
    `INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, source_type, source_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, type, points, newBalance, sourceType || null, sourceId || null, reason || null, createdBy || null]
  );
}

export async function getLoyaltyBalance(db, customerId) {
  await ensureRetailLoyaltySchema(db);
  const row = await db.get(`SELECT loyalty_points_balance FROM customers WHERE id = ?`, [customerId]);
  return round2(row?.loyalty_points_balance);
}

export async function listLoyaltyTransactions(db, customerId, { limit = 100 } = {}) {
  await ensureRetailLoyaltySchema(db);
  return db.all(`SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT ?`, [customerId, Math.min(500, Math.max(1, Number(limit) || 100))]);
}

/** How many points a NET (post-discount, pre-tax) sale amount would earn — used for both preview and posting. */
export async function estimateEarnedPoints(db, netAmount) {
  const { earnRateAmount } = await getLoyaltySettings(db);
  return Math.floor(Math.max(0, Number(netAmount) || 0) / earnRateAmount);
}

/** Idempotent by (source_type, source_id) — a checkout replay never earns points twice. */
export async function earnPointsForSale(db, { customerId, netAmount, sourceType = 'retail_sale', sourceId, createdBy = null }) {
  if (!customerId) return null;
  await ensureRetailLoyaltySchema(db);
  const existing = await db.get(`SELECT id FROM loyalty_transactions WHERE type = 'EARN' AND source_type = ? AND source_id = ?`, [sourceType, sourceId]);
  if (existing) return null;
  const points = await estimateEarnedPoints(db, netAmount);
  if (points <= 0) return null;
  const customer = await lockCustomer(db, customerId);
  const newBalance = round2(Number(customer.loyalty_points_balance) + points);
  await writeTransaction(db, { customerId, type: 'EARN', points, newBalance, sourceType, sourceId, reason: 'Sale reward', createdBy });
  return { points, balance: newBalance };
}

/** Validates balance + configured max-redemption cap; returns the currency value of the points, never posts a journal (see file header). */
export async function quoteRedemption(db, { customerId, points, saleTotal }) {
  await ensureRetailLoyaltySchema(db);
  const requested = Math.max(0, Math.floor(Number(points) || 0));
  if (requested <= 0) return { points: 0, value: 0 };
  const settings = await getLoyaltySettings(db);
  if (!settings.enabled) throw bad('Loyalty redemption is currently disabled.', 409);
  const customer = await db.get(`SELECT loyalty_points_balance FROM customers WHERE id = ?`, [customerId]);
  if (!customer) throw bad('Customer not found.', 404);
  if (requested > Number(customer.loyalty_points_balance) + 0.005) throw bad(`Only ${round2(customer.loyalty_points_balance)} points available.`, 409);
  let value = round2(requested / settings.pointsPerCurrency);
  const cap = round2(Number(saleTotal || 0) * settings.redeemMaxPercent / 100);
  if (value > cap) value = cap;
  return { points: requested, value };
}

/** Ledger + balance only — the caller (checkoutSale) already folded `value` into the sale's discount total. */
export async function redeemPoints(db, { customerId, points, sourceType = 'retail_sale', sourceId, reason = null, createdBy = null }) {
  const requested = Math.max(0, Math.floor(Number(points) || 0));
  if (requested <= 0) return null;
  await ensureRetailLoyaltySchema(db);
  const customer = await lockCustomer(db, customerId);
  const available = Number(customer.loyalty_points_balance);
  if (requested > available + 0.005) throw bad(`Only ${round2(available)} points available.`, 409);
  const newBalance = round2(available - requested);
  await writeTransaction(db, { customerId, type: 'REDEEM', points: -requested, newBalance, sourceType, sourceId, reason: reason || 'Redeemed at checkout', createdBy });
  return { points: requested, balance: newBalance };
}

/** Manual correction — always requires a reason. */
export async function adjustLoyaltyPoints(db, { customerId, points, reason, createdBy = null }) {
  const delta = Math.round(Number(points) || 0);
  if (!delta) throw bad('Adjustment cannot be zero.');
  if (!String(reason || '').trim()) throw bad('A reason is required for a loyalty adjustment.');
  await ensureRetailLoyaltySchema(db);
  return db.transaction(async (tx) => {
    const customer = await lockCustomer(tx, customerId);
    const newBalance = round2(Number(customer.loyalty_points_balance) + delta);
    if (newBalance < -0.005) throw bad('Adjustment would make the points balance negative.', 409);
    await writeTransaction(tx, { customerId, type: 'ADJUSTMENT', points: delta, newBalance, sourceType: 'manual_adjustment', reason, createdBy });
    return { points: delta, balance: newBalance };
  });
}

/**
 * Reverses the proportionate share of points earned on `originalSaleId`,
 * proportional to refundAmount / originalSubtotal (both post-discount,
 * pre-tax). Clamped so cumulative reversals for this sale never exceed what
 * was actually earned, and so the customer's balance never goes negative
 * (documented limitation: if they've already spent those points elsewhere,
 * the reversal is capped at whatever remains — not backdated as a debt).
 */
export async function reversePointsForReturn(db, { customerId, originalSaleId, originalSubtotal, refundAmount, createdBy = null }) {
  if (!customerId || !(refundAmount > 0) || !(originalSubtotal > 0)) return null;
  await ensureRetailLoyaltySchema(db);
  const earned = await db.get(
    `SELECT COALESCE(SUM(points), 0) AS total FROM loyalty_transactions WHERE type = 'EARN' AND source_type = 'retail_sale' AND source_id = ?`,
    [originalSaleId]
  );
  const earnedPoints = Number(earned?.total || 0);
  if (earnedPoints <= 0) return null;
  const alreadyReversed = await db.get(
    `SELECT COALESCE(SUM(-points), 0) AS total FROM loyalty_transactions WHERE type = 'REVERSAL' AND source_type = 'retail_sale' AND source_id = ?`,
    [originalSaleId]
  );
  const remainingReversible = Math.max(0, earnedPoints - Number(alreadyReversed?.total || 0));
  if (remainingReversible <= 0) return null;

  const proportion = Math.min(1, Number(refundAmount) / Number(originalSubtotal));
  const wanted = Math.min(remainingReversible, Math.round(earnedPoints * proportion));
  if (wanted <= 0) return null;

  const customer = await lockCustomer(db, customerId);
  const available = Number(customer.loyalty_points_balance);
  const toReverse = Math.min(wanted, Math.max(0, available)); // never drive balance negative
  if (toReverse <= 0) return null;
  const newBalance = round2(available - toReverse);
  await writeTransaction(db, {
    customerId, type: 'REVERSAL', points: -toReverse, newBalance, sourceType: 'retail_sale', sourceId: originalSaleId,
    reason: 'Return — proportionate points reversal', createdBy,
  });
  return { points: toReverse, balance: newBalance };
}
