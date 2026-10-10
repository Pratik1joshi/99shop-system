/**
 * Retail purchasing: Purchase Order -> Goods Receipt -> Accounts Payable ->
 * Supplier Payment -> Purchase Return.
 *
 * ── THE BOUNDARY ─────────────────────────────────────────────────────────
 * The legacy 99 Shop purchase flow (lib/purchases.js: `purchases` /
 * `purchase_items`, keyed to inventory_items, posted through
 * applyStockChange()) is untouched by this file and keeps working exactly
 * as before. Retail purchasing is a separate table set (migration 076)
 * keyed to menu_item_variants, posted through lib/retail-inventory.js. The
 * boundary is structural, not a runtime flag or name match: a retail line
 * always references variant_id and always calls receiveStock/issueStock; a
 * legacy line always references inventory_item_id and always calls
 * applyStockChange. Nothing here writes inventory_items or stock_movements;
 * nothing in lib/purchases.js writes inventory_balances or
 * inventory_movements.
 *
 * ── ACCOUNTING MODEL (revised in Phase 3.5 — see migration 077) ───────────
 * Phase 3 originally posted retail receipts to 5010 "Purchases" (an expense),
 * reusing the 99 Shop ledger's periodic-inventory pattern. Phase 3.5
 * corrected this: the 99 Shop ledger is genuinely periodic (purchases
 * expensed immediately, account 5010, comment in lib/accounting.js) and that
 * stays untouched — but Retail's Phase 2 ledger is a real perpetual-inventory
 * system (live balances, moving-average cost, planned per-sale COGS), and a
 * perpetual system needs Dr Inventory Asset at receipt / Dr COGS at sale, not
 * an expense-at-purchase model. Posting retail receipts to 5010 would silently
 * expense goods that are still sitting on the shelf.
 *
 * Retail now posts to account 1210 "Retail Inventory" (a NEW asset account,
 * not the legacy 1200 "Inventory" — see migration 077 for why sharing 1200
 * would break the inventory-valuation-vs-GL reconciliation) and, at sale time
 * (Phase 4), 5080 "Cost of Goods Sold". Purchase tax is capitalized into the
 * 1210 debit along with the goods cost (net landed cost) rather than tracked
 * in a separate recoverable input-tax account — consistent with how the
 * legacy purchase flow has always folded tax into its cost figure, and there
 * is no existing input-tax-credit mechanism in this codebase to plug into.
 *
 * A purchase return removes value at the CURRENT MOVING-AVERAGE cost, never
 * the line's entered price or the batch's original receipt cost — enforced by
 * lib/retail-inventory.js's postMovement(), which always prices an outbound
 * movement (including PURCHASE_RETURN) at the average, so this file reads the
 * actual cost back off the posted movements rather than trusting its own
 * purchase_return_lines.unit_cost input for the journal.
 *
 * Every mutator below is transaction-safe: postGoodsReceipt / postPurchaseReturn
 * wrap the whole operation (lines, inventory movements, PO/GRN status, journal)
 * in one db.transaction() and roll back completely on any failure.
 */

import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailInventorySchema, receiveStock, issueStock, getDefaultLocation, getInventoryValuation } from '@/lib/retail-inventory.js';
import { allocateValue, movementTotal } from '@/lib/inventory-money.js';
import { postJournal, paymentAccountCode, accountIdByCode, accountBalance } from '@/lib/accounting.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { nepalDateString } from '@/lib/report-dates.js';
import { ensureRetailSerialsSchema, registerSerialsOnReceipt, returnSerialToSupplier } from '@/lib/retail-serials.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// Same set as lib/accounting.js's private CREDIT_TO_AP — a purchase left
// unpaid is a payable, not cash out. Duplicated locally rather than reaching
// into that module's internals for one constant.
const CREDIT_METHODS = new Set(['credit', 'due', 'unpaid', 'on_credit', 'payable']);

function resolvePurchasePaymentAccount(method) {
  const m = String(method || 'credit').toLowerCase();
  if (CREDIT_METHODS.has(m)) return '2010';
  if (m === 'business_funding') return '1050';
  if (m === 'owner_pocket') return '3010';
  return paymentAccountCode(m); // cash -> 1010, bank/card/qr/esewa/khalti/fonepay/online -> 1020
}

let ENSURED = false;

export async function ensureRetailPurchasingSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureDocumentNumberSchema(db);

  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    location_id INTEGER REFERENCES inventory_locations(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    currency TEXT NOT NULL DEFAULT 'NPR',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by INTEGER,
    approved_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
    supplier_product_code TEXT,
    ordered_quantity NUMERIC(14,3) NOT NULL,
    purchase_unit TEXT NOT NULL DEFAULT 'unit',
    conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0,
    notes TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS goods_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    purchase_order_id INTEGER REFERENCES purchase_orders(id),
    location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by INTEGER,
    invoice_number TEXT,
    invoice_date DATE,
    payment_method TEXT NOT NULL DEFAULT 'credit',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    posted_at TIMESTAMP,
    voided_at TIMESTAMP,
    void_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_supplier_invoice_unique
    ON goods_receipts(supplier_id, invoice_number)
    WHERE invoice_number IS NOT NULL AND invoice_number <> '' AND status <> 'VOIDED'`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id),
    variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
    quantity_received NUMERIC(14,3) NOT NULL,
    purchase_unit TEXT NOT NULL DEFAULT 'unit',
    conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1,
    stock_quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS goods_receipt_line_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_line_id INTEGER NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    manufactured_date DATE,
    expiry_date DATE,
    quantity NUMERIC(14,3) NOT NULL
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    goods_receipt_id INTEGER REFERENCES goods_receipts(id),
    location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    refund_method TEXT NOT NULL DEFAULT 'credit_note',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by INTEGER,
    posted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    goods_receipt_line_id INTEGER REFERENCES goods_receipt_lines(id),
    variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
    batch_id INTEGER REFERENCES inventory_batches(id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    inventory_unit_cost NUMERIC(14,4),
    inventory_value NUMERIC(14,2),
    variance_amount NUMERIC(14,2),
    reason TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS purchase_return_line_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_line_id INTEGER NOT NULL REFERENCES purchase_return_lines(id) ON DELETE CASCADE,
    serial_number TEXT NOT NULL,
    UNIQUE (purchase_return_line_id, serial_number)
  )`);

  if (!ENSURED) {
    await ensureColumn(db, 'menu_item_variants', 'tracking_mode', "TEXT NOT NULL DEFAULT 'none'");
    await ensureColumn(db, 'purchase_orders', 'submitted_by', 'INTEGER');
    await ensureColumn(db, 'purchase_orders', 'submitted_at', 'TIMESTAMP');
    await ensureColumn(db, 'purchase_orders', 'approved_at', 'TIMESTAMP');
    await ensureColumn(db, 'purchase_orders', 'rejected_by', 'INTEGER');
    await ensureColumn(db, 'purchase_orders', 'rejected_at', 'TIMESTAMP');
    await ensureColumn(db, 'purchase_orders', 'rejection_reason', 'TEXT');
    ENSURED = true;
  }
}

function lineNet(qty, unitCost, discount, tax) {
  return round2(qty * unitCost - Number(discount || 0) + Number(tax || 0));
}

/* ------------------------------------------------------------ purchase orders */

export async function createPurchaseOrder(db, data) {
  const lines = (data.lines || []).map((l) => {
    const orderedQuantity = Number(l.ordered_quantity ?? l.orderedQuantity);
    const unitCost = Number(l.unit_cost ?? l.unitCost ?? 0);
    if (!l.variant_id && !l.variantId) throw bad('Every PO line needs a variant.');
    if (!(orderedQuantity > 0)) throw bad('Ordered quantity must be greater than zero.');
    const discount = Number(l.discount_amount ?? l.discountAmount ?? 0);
    const tax = Number(l.tax_amount ?? l.taxAmount ?? 0);
    return {
      variant_id: Number(l.variant_id ?? l.variantId),
      supplier_product_code: l.supplier_product_code ?? l.supplierProductCode ?? null,
      ordered_quantity: orderedQuantity,
      purchase_unit: l.purchase_unit ?? l.purchaseUnit ?? 'unit',
      conversion_factor: Number(l.conversion_factor ?? l.conversionFactor ?? 1) || 1,
      unit_cost: unitCost,
      discount_amount: discount,
      tax_amount: tax,
      net_amount: lineNet(orderedQuantity, unitCost, discount, tax),
      notes: l.notes || null,
    };
  });
  if (!lines.length) throw bad('Add at least one purchase order line.');
  if (!data.supplier_id && !data.supplierId) throw bad('Choose a supplier.');

  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const poNumber = data.po_number || await nextDocumentNumber(tx, { type: 'purchase_order', prefix: 'PO' });
    const locationId = data.location_id || data.locationId || (await getDefaultLocation(tx))?.id || null;
    const result = await tx.run(
      `INSERT INTO purchase_orders
         (po_number, supplier_id, location_id, order_date, expected_date, currency, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        poNumber, Number(data.supplier_id ?? data.supplierId), locationId,
        data.order_date || nepalDateString(), data.expected_date || null,
        data.currency || 'NPR', data.notes || null, data.created_by ?? data.createdBy ?? null,
      ]
    );
    const poId = result.lastInsertRowid;
    for (const l of lines) {
      await tx.run(
        `INSERT INTO purchase_order_lines
           (purchase_order_id, variant_id, supplier_product_code, ordered_quantity, purchase_unit,
            conversion_factor, unit_cost, discount_amount, tax_amount, net_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poId, l.variant_id, l.supplier_product_code, l.ordered_quantity, l.purchase_unit,
          l.conversion_factor, l.unit_cost, l.discount_amount, l.tax_amount, l.net_amount, l.notes]
      );
    }
    return getPurchaseOrder(tx, poId);
  });
}

export async function getPurchaseOrder(db, id) {
  const po = await db.get(`SELECT * FROM purchase_orders WHERE id = ?`, [id]);
  if (!po) return null;
  const lines = await db.all(
    `SELECT pol.*, v.variant_name, v.sku, mi.name AS product_name, v.tracking_mode FROM purchase_order_lines pol
     LEFT JOIN menu_item_variants v ON v.id = pol.variant_id
     LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
     WHERE pol.purchase_order_id = ? ORDER BY pol.id`,
    [id]
  );
  return { ...po, lines };
}

/** DRAFT/PENDING_APPROVAL -> APPROVED. Approving a PO never touches stock. */
export async function submitPurchaseOrder(db, id, { submittedBy = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const po = await tx.get(`SELECT id,status FROM purchase_orders WHERE id=?${lock}`, [id]);
    if (!po) throw bad('Purchase order not found.', 404);
    if (po.status !== 'DRAFT') throw bad(`Cannot submit a PO in status ${po.status}.`, 409);
    await tx.run(`UPDATE purchase_orders SET status='PENDING_APPROVAL',submitted_by=?,submitted_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`, [submittedBy, id]);
    return getPurchaseOrder(tx, id);
  });
}

export async function rejectPurchaseOrder(db, id, { rejectedBy = null, reason } = {}) {
  await ensureRetailPurchasingSchema(db);
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw bad('A rejection reason is required.');
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const po = await tx.get(`SELECT id,status FROM purchase_orders WHERE id=?${lock}`, [id]);
    if (!po) throw bad('Purchase order not found.', 404);
    if (po.status !== 'PENDING_APPROVAL') throw bad(`Cannot reject a PO in status ${po.status}.`, 409);
    await tx.run(`UPDATE purchase_orders SET status='REJECTED',rejected_by=?,rejected_at=CURRENT_TIMESTAMP,
      rejection_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [rejectedBy, cleanReason, id]);
    return getPurchaseOrder(tx, id);
  });
}

export async function approvePurchaseOrder(db, id, { approvedBy = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const po = await tx.get(`SELECT * FROM purchase_orders WHERE id = ?${lock}`, [id]);
    if (!po) throw bad('Purchase order not found.', 404);
    if (po.status !== 'PENDING_APPROVAL') throw bad(`Cannot approve a PO in status ${po.status}. Submit it for approval first.`, 409);
    await tx.run(`UPDATE purchase_orders SET status = 'APPROVED', approved_by = ?, approved_at=CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [approvedBy, id]);
    return getPurchaseOrder(tx, id);
  });
}

/** Cancel is only for a PO nothing has been received against — a posted receipt needs a purchase return instead. */
export async function cancelPurchaseOrder(db, id, { reason = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const po = await tx.get(`SELECT * FROM purchase_orders WHERE id = ?`, [id]);
    if (!po) throw bad('Purchase order not found.', 404);
    if (po.status === 'CANCELLED') throw bad('Already cancelled.', 409);
    const received = await tx.get(
      `SELECT COALESCE(SUM(quantity_received), 0) AS total FROM purchase_order_lines WHERE purchase_order_id = ?`,
      [id]
    );
    if (Number(received?.total || 0) > 0) {
      throw bad('Stock has already been received against this PO — use a purchase return, not cancellation.', 409);
    }
    await tx.run(`UPDATE purchase_orders SET status = 'CANCELLED', notes = COALESCE(notes || ' | ', '') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [reason ? `Cancelled: ${reason}` : 'Cancelled', id]);
    return getPurchaseOrder(tx, id);
  });
}

/* -------------------------------------------------------------- goods receipts */

function computeGrnLine(l) {
  const quantityReceived = Number(l.quantity_received ?? l.quantityReceived);
  if (!(quantityReceived > 0)) throw bad('Each GRN line needs a positive received quantity.');
  const conversionFactor = Number(l.conversion_factor ?? l.conversionFactor ?? 1) || 1;
  const unitCost = Number(l.unit_cost ?? l.unitCost ?? 0);
  const discount = Number(l.discount_amount ?? l.discountAmount ?? 0);
  const tax = Number(l.tax_amount ?? l.taxAmount ?? 0);
  const stockQuantity = round2(quantityReceived * conversionFactor);
  const batches = (l.batches || []).map((b) => ({
    batch_number: String(b.batch_number ?? b.batchNumber ?? '').trim(),
    manufactured_date: b.manufactured_date ?? b.manufacturedDate ?? null,
    expiry_date: b.expiry_date ?? b.expiryDate ?? null,
    quantity: Number(b.quantity),
  }));
  if (batches.length) {
    const sum = round2(batches.reduce((s, b) => s + b.quantity, 0));
    if (Math.abs(sum - stockQuantity) > 0.005) {
      throw bad(`Batch quantities (${sum}) must add up to the line's stock quantity (${stockQuantity}).`);
    }
    if (batches.some((b) => !b.batch_number)) throw bad('Every batch split needs a batch number.');
    if (batches.some((b) => b.manufactured_date && b.expiry_date && b.expiry_date < b.manufactured_date)) {
      throw bad('Expiry date cannot be before the manufacturing date.');
    }
  }
  // Serial-tracked lines: exact count enforced at POST time (needs the
  // variant's tracking_mode, not known here) — captured now, validated there.
  const serialNumbers = [...new Set((l.serial_numbers ?? l.serialNumbers ?? []).map((s) => String(s).trim()).filter(Boolean))];
  return {
    purchase_order_line_id: l.purchase_order_line_id ?? l.purchaseOrderLineId ?? null,
    variant_id: Number(l.variant_id ?? l.variantId),
    quantity_received: quantityReceived,
    purchase_unit: l.purchase_unit ?? l.purchaseUnit ?? 'unit',
    conversion_factor: conversionFactor,
    stock_quantity: stockQuantity,
    unit_cost: unitCost,
    discount_amount: discount,
    tax_amount: tax,
    net_amount: lineNet(quantityReceived, unitCost, discount, tax),
    notes: l.notes || null,
    batches,
    serialNumbers,
  };
}

/** Creates a DRAFT GRN. No inventory or accounting effect until postGoodsReceipt(). */
export async function createGoodsReceipt(db, data) {
  const lines = (data.lines || []).map(computeGrnLine);
  if (!lines.length) throw bad('Add at least one goods receipt line.');
  if (!data.supplier_id && !data.supplierId) throw bad('Choose a supplier.');

  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const grnNumber = data.grn_number || await nextDocumentNumber(tx, { type: 'goods_receipt', prefix: 'GRN' });
    const locationId = data.location_id || data.locationId || (await getDefaultLocation(tx))?.id;
    if (!locationId) throw bad('No destination location available.');

    const result = await tx.run(
      `INSERT INTO goods_receipts
         (grn_number, supplier_id, purchase_order_id, location_id, receipt_date, received_by,
          invoice_number, invoice_date, payment_method, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      [
        grnNumber, Number(data.supplier_id ?? data.supplierId), data.purchase_order_id ?? data.purchaseOrderId ?? null,
        locationId, data.receipt_date || nepalDateString(), data.received_by ?? data.receivedBy ?? null,
        data.invoice_number ?? data.invoiceNumber ?? null, data.invoice_date ?? data.invoiceDate ?? null,
        data.payment_method ?? data.paymentMethod ?? 'credit', data.notes || null,
      ]
    );
    const grnId = result.lastInsertRowid;

    for (const l of lines) {
      const lineResult = await tx.run(
        `INSERT INTO goods_receipt_lines
           (goods_receipt_id, purchase_order_line_id, variant_id, quantity_received, purchase_unit,
            conversion_factor, stock_quantity, unit_cost, discount_amount, tax_amount, net_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grnId, l.purchase_order_line_id, l.variant_id, l.quantity_received, l.purchase_unit,
          l.conversion_factor, l.stock_quantity, l.unit_cost, l.discount_amount, l.tax_amount, l.net_amount, l.notes]
      );
      const lineId = lineResult.lastInsertRowid;
      for (const b of l.batches) {
        await tx.run(
          `INSERT INTO goods_receipt_line_batches (goods_receipt_line_id, batch_number, manufactured_date, expiry_date, quantity)
           VALUES (?, ?, ?, ?, ?)`,
          [lineId, b.batch_number, b.manufactured_date, b.expiry_date, b.quantity]
        );
      }
      if (l.serialNumbers.length) {
        await ensureRetailSerialsSchema(tx);
        for (const serial of l.serialNumbers) {
          await tx.run(`INSERT INTO goods_receipt_line_serials (goods_receipt_line_id, serial_number) VALUES (?, ?)`, [lineId, serial]);
        }
      }
    }
    return getGoodsReceipt(tx, grnId);
  });
}

export async function getGoodsReceipt(db, id) {
  const grn = await db.get(`SELECT * FROM goods_receipts WHERE id = ?`, [id]);
  if (!grn) return null;
  const lines = await db.all(
    `SELECT grl.*, v.variant_name, v.tracking_mode, mi.name AS product_name FROM goods_receipt_lines grl
     LEFT JOIN menu_item_variants v ON v.id = grl.variant_id
     LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
     WHERE grl.goods_receipt_id = ? ORDER BY grl.id`,
    [id]
  );
  for (const line of lines) {
    line.batches = await db.all(`SELECT * FROM goods_receipt_line_batches WHERE goods_receipt_line_id = ? ORDER BY id`, [line.id]);
    line.serial_numbers = (await db.all(`SELECT serial_number FROM goods_receipt_line_serials WHERE goods_receipt_line_id = ? ORDER BY id`, [line.id]).catch(() => [])).map((r) => r.serial_number);
    const returned = await db.get(`SELECT COALESCE(SUM(prl.quantity),0) AS quantity FROM purchase_return_lines prl
      JOIN purchase_returns pr ON pr.id=prl.purchase_return_id WHERE prl.goods_receipt_line_id=? AND pr.status='POSTED'`, [line.id]);
    line.returned_quantity = Number(returned?.quantity || 0);
    if (line.tracking_mode === 'batch') {
      line.inventory_batches = await db.all(`SELECT DISTINCT ib.id,ib.batch_number,ib.expiry_date,b.quantity_on_hand
        FROM inventory_movements m JOIN inventory_batches ib ON ib.id=m.batch_id
        LEFT JOIN inventory_balances b ON b.batch_id=ib.id AND b.location_id=?
        WHERE m.reference_type='goods_receipt_line' AND m.reference_id=? AND m.movement_type='PURCHASE_RECEIPT'`,
      [grn.location_id, line.id]);
    }
    if (line.tracking_mode === 'serial') {
      line.available_serial_numbers = (await db.all(`SELECT serial_number FROM inventory_serials WHERE reference_type='goods_receipt_line'
        AND reference_id=? AND status='IN_STOCK' AND location_id=? ORDER BY serial_number`, [line.id, grn.location_id])).map((r) => r.serial_number);
    }
  }
  return { ...grn, lines };
}

async function recomputePurchaseOrderStatus(db, purchaseOrderId) {
  if (!purchaseOrderId) return;
  const lines = await db.all(`SELECT ordered_quantity, quantity_received FROM purchase_order_lines WHERE purchase_order_id = ?`, [purchaseOrderId]);
  if (!lines.length) return;
  const allReceived = lines.every((l) => Number(l.quantity_received) >= Number(l.ordered_quantity) - 0.0005);
  const anyReceived = lines.some((l) => Number(l.quantity_received) > 0.0005);
  const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : null;
  if (status) {
    await db.run(`UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('CANCELLED','CLOSED')`, [status, purchaseOrderId]);
  }
}

/**
 * Post a DRAFT GRN: receives stock into the retail ledger (batch-split where
 * given), updates the linked PO's cumulative received quantity/status, and
 * posts one balanced accounting journal for the whole receipt. Idempotent —
 * an already-POSTED GRN is returned unchanged rather than re-applied.
 */
export async function postGoodsReceipt(db, id, { postedBy = null, allowOverReceipt = false, businessDayId = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const grn = await tx.get(`SELECT * FROM goods_receipts WHERE id = ?${lock}`, [id]);
    if (!grn) throw bad('Goods receipt not found.', 404);
    if (grn.status === 'POSTED') return getGoodsReceipt(tx, id); // idempotent replay
    if (grn.status === 'VOIDED') throw bad('This goods receipt was voided.', 409);

    const lines = await tx.all(`SELECT * FROM goods_receipt_lines WHERE goods_receipt_id = ?`, [id]);
    if (grn.purchase_order_id) {
      const po = await tx.get(`SELECT id,supplier_id,status FROM purchase_orders WHERE id=?${lock}`, [grn.purchase_order_id]);
      if (!po || Number(po.supplier_id) !== Number(grn.supplier_id) || !['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw bad('Receipt must belong to an approved purchase order for the same supplier.', 409);
      }
    }
    let totalNet = 0;

    for (const line of lines) {
      const variant = await tx.get(`SELECT * FROM menu_item_variants WHERE id = ?`, [line.variant_id]);
      if (!variant) throw bad(`Variant ${line.variant_id} not found.`);

      if (line.purchase_order_line_id) {
        const poLine = await tx.get(`SELECT * FROM purchase_order_lines WHERE id = ?${lock}`, [line.purchase_order_line_id]);
        if (!poLine || Number(poLine.purchase_order_id) !== Number(grn.purchase_order_id) || Number(poLine.variant_id) !== Number(line.variant_id)) {
          throw bad('Receipt line does not match the selected purchase order and product.', 409);
        }
        if (poLine) {
          const remaining = round2(Number(poLine.ordered_quantity) - Number(poLine.quantity_received));
          if (line.quantity_received - remaining > 0.005 && !allowOverReceipt) {
            throw bad(
              `Over-receipt: PO line ${poLine.id} has ${remaining} ${poLine.purchase_unit} remaining, this GRN line receives ${line.quantity_received}.`,
              409
            );
          }
          await tx.run(`UPDATE purchase_order_lines SET quantity_received = quantity_received + ? WHERE id = ?`, [line.quantity_received, poLine.id]);
        }
      } else if (grn.purchase_order_id) {
        throw bad('Every purchase order receipt line must reference its order line.', 409);
      }

      const batches = await tx.all(`SELECT * FROM goods_receipt_line_batches WHERE goods_receipt_line_id = ?`, [line.id]);
      if (variant.tracking_mode === 'batch' && !batches.length) {
        throw bad(`"${variant.variant_name}" is batch-tracked — this GRN line needs at least one batch.`);
      }

      if (variant.tracking_mode === 'serial') {
        await ensureRetailSerialsSchema(tx);
        const serialRows = await tx.all(`SELECT serial_number FROM goods_receipt_line_serials WHERE goods_receipt_line_id = ?`, [line.id]);
        const serials = serialRows.map((r) => r.serial_number);
        if (serials.length !== Number(line.quantity_received)) {
          throw bad(`"${variant.variant_name}" received quantity is ${line.quantity_received} but ${serials.length} serial number(s) were entered — they must match exactly.`, 400);
        }
        await registerSerialsOnReceipt(tx, {
          variantId: line.variant_id, locationId: grn.location_id, serialNumbers: serials,
          unitCost: line.unit_cost, totalValue: line.net_amount, supplierId: grn.supplier_id,
          referenceType: 'goods_receipt_line', referenceId: line.id,
          reason: `GRN ${grn.grn_number}`, businessDayId, createdBy: postedBy,
        });
        totalNet = round2(totalNet + Number(line.net_amount));
        continue; // registerSerialsOnReceipt already called receiveStock — skip the generic paths below.
      }

      if (batches.length) {
        const values = allocateValue(line.net_amount, batches.map(b => b.quantity));
        for (const [index, b] of batches.entries()) {
          await receiveStock(tx, {
            variantId: line.variant_id, locationId: grn.location_id, quantity: b.quantity,
            unitCost: line.unit_cost, totalValue: values[index], movementType: 'PURCHASE_RECEIPT',
            batchNumber: b.batch_number, manufacturedDate: b.manufactured_date, expiryDate: b.expiry_date,
            supplierId: grn.supplier_id,
            // Not passing purchaseId: inventory_batches.purchase_id (migration 075) is a
            // legacy `purchases` table FK, not this file's `purchase_orders`/`goods_receipts`.
            // Provenance is fully recoverable via this movement's reference_type/reference_id.
            referenceType: 'goods_receipt_line', referenceId: line.id,
            reason: `GRN ${grn.grn_number}`, businessDayId, createdBy: postedBy,
          });
        }
      } else {
        await receiveStock(tx, {
          variantId: line.variant_id, locationId: grn.location_id, quantity: line.stock_quantity,
          unitCost: line.unit_cost, totalValue: line.net_amount, movementType: 'PURCHASE_RECEIPT',
          referenceType: 'goods_receipt_line', referenceId: line.id,
          reason: `GRN ${grn.grn_number}`, businessDayId, createdBy: postedBy,
        });
      }
      totalNet = round2(totalNet + Number(line.net_amount));
    }

    if (grn.purchase_order_id) await recomputePurchaseOrderStatus(tx, grn.purchase_order_id);

    const resolvedBusinessDayId = businessDayId || await currentBusinessDayId(tx, { required: true, allowStale: true });
    if (totalNet > 0.005) {
      const creditCode = resolvePurchasePaymentAccount(grn.payment_method);
      await postJournal(tx, {
        entry_date: grn.invoice_date || grn.receipt_date,
        memo: `Goods receipt ${grn.grn_number}${grn.invoice_number ? ` — invoice ${grn.invoice_number}` : ''}`,
        source_type: 'goods_receipt',
        source_id: grn.id,
        created_by: postedBy,
        business_day_id: resolvedBusinessDayId,
        lines: [
          { code: '1210', debit: totalNet, credit: 0, memo: 'Retail inventory received' },
          { code: creditCode, debit: 0, credit: totalNet, supplier_id: creditCode === '2010' ? grn.supplier_id : null, memo: `Paid ${grn.payment_method}` },
        ],
      });
    }

    await tx.run(`UPDATE goods_receipts SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    return getGoodsReceipt(tx, id);
  });
}

/* ------------------------------------------------------------- purchase returns */

function computeReturnLine(l) {
  const quantity = Number(l.quantity);
  if (!(quantity > 0)) throw bad('Each return line needs a positive quantity.');
  return {
    goods_receipt_line_id: l.goods_receipt_line_id ?? l.goodsReceiptLineId ?? null,
    variant_id: Number(l.variant_id ?? l.variantId),
    batch_id: l.batch_id ?? l.batchId ?? null,
    quantity,
    // Supplier credit rate. Explicit if given; otherwise defaults to what we
    // actually paid on the original GRN line — resolved below, since that
    // needs a query. This is display/AP-facing only; it is NOT what removes
    // inventory value (that's always the moving average — see postPurchaseReturn).
    unit_cost: l.unit_cost != null || l.unitCost != null ? Number(l.unit_cost ?? l.unitCost) : null,
    serial_numbers: (l.serial_numbers ?? l.serialNumbers ?? []).map((s) => String(s).trim()).filter(Boolean),
    reason: l.reason || null,
  };
}

export async function createPurchaseReturn(db, data) {
  const lines = (data.lines || []).map(computeReturnLine);
  if (!lines.length) throw bad('Add at least one return line.');
  if (!data.supplier_id && !data.supplierId) throw bad('Choose a supplier.');
  const receiptId = Number(data.goods_receipt_id ?? data.goodsReceiptId);
  if (!receiptId) throw bad('Choose the original posted goods receipt.');

  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const receipt = await tx.get(`SELECT id,supplier_id,location_id,status FROM goods_receipts WHERE id=?`, [receiptId]);
    if (!receipt || receipt.status !== 'POSTED' || Number(receipt.supplier_id) !== Number(data.supplier_id ?? data.supplierId)) {
      throw bad('Choose a posted receipt from the selected supplier.', 409);
    }
    if ((data.location_id ?? data.locationId) && Number(data.location_id ?? data.locationId) !== Number(receipt.location_id)) {
      throw bad('Return location must match the source receipt.', 409);
    }
    const requestedByLine = new Map();
    for (const l of lines) {
      if (!l.goods_receipt_line_id) throw bad('Every return line must reference an original receipt line.');
      const source = await tx.get(`SELECT id,goods_receipt_id,variant_id,stock_quantity,unit_cost FROM goods_receipt_lines WHERE id=?`, [l.goods_receipt_line_id]);
      if (!source || Number(source.goods_receipt_id) !== receiptId || Number(source.variant_id) !== Number(l.variant_id)) {
        throw bad('Return line does not match the original receipt and product.', 409);
      }
      const prior = await tx.get(`SELECT COALESCE(SUM(prl.quantity),0) AS quantity FROM purchase_return_lines prl
        JOIN purchase_returns pr ON pr.id=prl.purchase_return_id WHERE prl.goods_receipt_line_id=? AND pr.status='POSTED'`, [l.goods_receipt_line_id]);
      const alreadyRequested = requestedByLine.get(Number(l.goods_receipt_line_id)) || 0;
      if (alreadyRequested + l.quantity + Number(prior?.quantity || 0) > Number(source.stock_quantity) + 0.0005) {
        throw bad('Return quantity exceeds the unreturned quantity on the original receipt.', 409);
      }
      requestedByLine.set(Number(l.goods_receipt_line_id), alreadyRequested + l.quantity);
      const variant = await tx.get(`SELECT tracking_mode, variant_name FROM menu_item_variants WHERE id = ?`, [l.variant_id]);
      if (!variant) throw bad(`Variant ${l.variant_id} not found.`);
      if (variant.tracking_mode === 'serial') {
        if (!Number.isInteger(l.quantity) || l.serial_numbers.length !== l.quantity || new Set(l.serial_numbers).size !== l.serial_numbers.length) {
          throw bad('Enter one unique original serial number for each returned unit.', 409);
        }
        for (const serial of l.serial_numbers) {
          const identity = await tx.get(`SELECT id,status,location_id,reference_type,reference_id FROM inventory_serials WHERE serial_number=? AND variant_id=?`, [serial, l.variant_id]);
          if (!identity || identity.status !== 'IN_STOCK' || Number(identity.location_id) !== Number(receipt.location_id) ||
              identity.reference_type !== 'goods_receipt_line' || Number(identity.reference_id) !== Number(l.goods_receipt_line_id)) {
            throw bad(`Serial ${serial} is not available from the selected receipt.`, 409);
          }
        }
      } else if (l.serial_numbers.length) throw bad('Serial numbers may only be entered for serial-tracked items.');
      if (variant.tracking_mode === 'batch' && !l.batch_id) {
        throw bad(`"${variant.variant_name}" is batch-tracked — pick the batch this return comes from.`);
      }
      if (l.batch_id) {
        const batch = await tx.get(`SELECT id FROM inventory_batches WHERE id = ? AND variant_id = ?`, [l.batch_id, l.variant_id]);
        const sourceBatch = await tx.get(`SELECT 1 AS found FROM inventory_movements WHERE variant_id=? AND batch_id=?
          AND reference_type='goods_receipt_line' AND reference_id=? AND movement_type='PURCHASE_RECEIPT' LIMIT 1`,
        [l.variant_id, l.batch_id, l.goods_receipt_line_id]);
        if (!sourceBatch) throw bad('Batch was not received on the selected receipt line.', 409);
        if (!batch) throw bad('That batch does not belong to this variant — cannot return Batch B stock against Batch A.', 400);
      }
      if (l.unit_cost == null) {
        // Default supplier credit rate = what we actually paid on the referenced GRN line.
        const grnLine = l.goods_receipt_line_id
          ? await tx.get(`SELECT unit_cost FROM goods_receipt_lines WHERE id = ?`, [l.goods_receipt_line_id])
          : null;
        l.unit_cost = Number(grnLine?.unit_cost ?? 0);
      }
      l.net_amount = round2(l.quantity * l.unit_cost);
    }

    const returnNumber = data.return_number || await nextDocumentNumber(tx, { type: 'purchase_return', prefix: 'PR' });
    const locationId = receipt.location_id;
    const result = await tx.run(
      `INSERT INTO purchase_returns
         (return_number, supplier_id, goods_receipt_id, location_id, return_date, reason, refund_method, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        returnNumber, Number(data.supplier_id ?? data.supplierId), data.goods_receipt_id ?? data.goodsReceiptId ?? null,
        locationId, data.return_date || nepalDateString(), data.reason || null,
        data.refund_method ?? data.refundMethod ?? 'credit_note', data.created_by ?? data.createdBy ?? null,
      ]
    );
    const returnId = result.lastInsertRowid;
    for (const l of lines) {
      const lineResult = await tx.run(
        `INSERT INTO purchase_return_lines
           (purchase_return_id, goods_receipt_line_id, variant_id, batch_id, quantity, unit_cost, net_amount, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [returnId, l.goods_receipt_line_id, l.variant_id, l.batch_id, l.quantity, l.unit_cost, l.net_amount, l.reason]
      );
      for (const serial of l.serial_numbers) {
        await tx.run(`INSERT INTO purchase_return_line_serials (purchase_return_line_id,serial_number) VALUES (?,?)`, [lineResult.lastInsertRowid, serial]);
      }
    }
    return getPurchaseReturn(tx, returnId);
  });
}

export async function getPurchaseReturn(db, id) {
  const ret = await db.get(`SELECT * FROM purchase_returns WHERE id = ?`, [id]);
  if (!ret) return null;
  const lines = await db.all(
    `SELECT prl.*, v.variant_name FROM purchase_return_lines prl
     LEFT JOIN menu_item_variants v ON v.id = prl.variant_id
     WHERE prl.purchase_return_id = ? ORDER BY prl.id`,
    [id]
  );
  for (const line of lines) {
    line.serial_numbers = (await db.all(`SELECT serial_number FROM purchase_return_line_serials WHERE purchase_return_line_id=? ORDER BY id`, [line.id])).map((row) => row.serial_number);
  }
  return { ...ret, lines };
}

/**
 * Post a DRAFT purchase return.
 *
 * ── POLICY (Phase 4.5) — two values, not one ───────────────────────────────
 * A return has a SUPPLIER CREDIT (what they actually credit us — commercial
 * reality, defaults to what we paid on the referenced GRN line, editable) and
 * an INVENTORY CARRYING VALUE REMOVED (always the moving average at this
 * instant — same rule as every other outbound movement, via issueStock).
 * With multiple receipts blended into one moving average, these are not
 * guaranteed equal (10@100 + 10@140 averages to 120; a supplier who credits
 * at the 140 they were actually paid is crediting more than the 120/unit now
 * sitting in the ledger). Forcing them equal would either misstate what's
 * owed to the supplier or silently misstate inventory value — both wrong.
 * The difference posts to 5090 "Purchase Price Variance" (same idea as the
 * existing 5060 "Cash Over / Short" variance account) rather than being
 * absorbed into either figure. This is deliberately NOT "original receipt
 * cost reversal with average recompute" (the spec's Approach A) — moving
 * average has no per-receipt cost layers to un-blend (the exact limitation
 * lib/purchases.js's voidPurchase() already documents for the legacy ledger:
 * "un-averaging needs a cost-layer stack... add layers only if material"),
 * so recomputing a historical average from one return is not something this
 * costing method can do correctly.
 */
export async function postPurchaseReturn(db, id, { postedBy = null, businessDayId = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const ret = await tx.get(`SELECT * FROM purchase_returns WHERE id = ?${lock}`, [id]);
    if (!ret) throw bad('Purchase return not found.', 404);
    if (ret.status === 'POSTED') return getPurchaseReturn(tx, id); // idempotent replay
    if (ret.status === 'VOIDED') throw bad('This purchase return was voided.', 409);

    const lines = await tx.all(`SELECT * FROM purchase_return_lines WHERE purchase_return_id = ?`, [id]);
    let totalSupplierCredit = 0;
    let totalInventoryValue = 0;
    for (const line of lines) {
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
      const serials = variant?.tracking_mode === 'serial'
        ? (await tx.all(`SELECT serial_number FROM purchase_return_line_serials WHERE purchase_return_line_id=? ORDER BY id`, [line.id])).map((row) => row.serial_number)
        : [];
      if (variant?.tracking_mode === 'serial' && serials.length !== Number(line.quantity)) throw bad('Return serial count must match quantity.', 409);
      const appliedMovements = serials.length ? [] : await issueStock(tx, {
        variantId: line.variant_id, locationId: ret.location_id, quantity: line.quantity,
        movementType: 'PURCHASE_RETURN', batchId: line.batch_id,
        referenceType: 'purchase_return_line', referenceId: line.id,
        reason: ret.reason || `Return ${ret.return_number}`, businessDayId, createdBy: postedBy,
      });
      for (const serial of serials) {
        const returned = await returnSerialToSupplier(tx, { serialNumber: serial, receiptLineId: line.goods_receipt_line_id,
          returnLineId: line.id, locationId: ret.location_id, businessDayId, createdBy: postedBy });
        appliedMovements.push(...returned.applied);
      }
      const inventoryValue = movementTotal(appliedMovements);
      const inventoryUnitCost = round2(inventoryValue / Number(line.quantity));
      // Supplier credit: whatever was set at createPurchaseReturn time (explicit,
      // or defaulted to the original GRN line's price) — untouched here.
      const supplierCredit = round2(Number(line.unit_cost) * Number(line.quantity));
      const variance = round2(supplierCredit - inventoryValue);

      await tx.run(
        `UPDATE purchase_return_lines
         SET net_amount = ?, inventory_unit_cost = ?, inventory_value = ?, variance_amount = ?
         WHERE id = ?`,
        [supplierCredit, inventoryUnitCost, inventoryValue, variance, line.id]
      );
      totalSupplierCredit = round2(totalSupplierCredit + supplierCredit);
      totalInventoryValue = round2(totalInventoryValue + inventoryValue);
    }
    const totalVariance = round2(totalSupplierCredit - totalInventoryValue);

    const resolvedBusinessDayId = businessDayId || await currentBusinessDayId(tx, { required: true, allowStale: true });
    if (totalSupplierCredit > 0.005 || totalInventoryValue > 0.005) {
      const debitCode = ret.refund_method === 'cash' ? '1010' : ret.refund_method === 'bank' ? '1020' : '2010';
      const journalLines = [
        { code: debitCode, debit: totalSupplierCredit, credit: 0, supplier_id: debitCode === '2010' ? ret.supplier_id : null, memo: 'Supplier credit / refund' },
        { code: '1210', debit: 0, credit: totalInventoryValue, memo: 'Retail inventory returned to supplier' },
      ];
      // Balance the two independent figures through the variance account —
      // never by silently adjusting the supplier credit or the inventory value.
      if (totalVariance > 0.005) {
        journalLines.push({ code: '5090', debit: 0, credit: totalVariance, memo: 'Purchase price variance — supplier credited above carrying value' });
      } else if (totalVariance < -0.005) {
        journalLines.push({ code: '5090', debit: -totalVariance, credit: 0, memo: 'Purchase price variance — supplier credited below carrying value' });
      }
      await postJournal(tx, {
        entry_date: ret.return_date,
        memo: `Purchase return ${ret.return_number}`,
        source_type: 'purchase_return',
        source_id: ret.id,
        created_by: postedBy,
        business_day_id: resolvedBusinessDayId,
        lines: journalLines,
      });
    }

    await tx.run(`UPDATE purchase_returns SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    return getPurchaseReturn(tx, id);
  });
}

/* --------------------------------------------------------- reconciliation */

/**
 * Retail Inventory Valuation (Σ variant average_cost × on-hand qty) should
 * equal the account 1210 GL balance, subject only to documented differences
 * — right now, none: everything that touches 1210 goes through
 * postGoodsReceipt/postPurchaseReturn in this file, and everything that
 * touches inventory_costs goes through the same movements in
 * lib/retail-inventory.js. A divergence here means a bug, not "expected drift".
 */
export async function reconcileRetailInventoryValuation(db) {
  const valuation = await getInventoryValuation(db);
  const glBalance = round2(await accountBalance(db, '1210'));
  const difference = round2(valuation.total - glBalance);
  return {
    inventoryValuation: valuation.total,
    glBalance,
    difference,
    reconciled: Math.abs(difference) < 0.01,
    byVariant: valuation.byVariant,
  };
}
