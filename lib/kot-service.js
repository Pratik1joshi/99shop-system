/**
 * Admin single-operator KOT engine.
 *
 * Turns the shared kitchen `kots` / `kot_items` tables into an immutable
 * production record: each KOT is a snapshot of the quantities that were unsent
 * at issue time, with a per-order sequence, human-readable number, issuing
 * administrator, reprint counter and idempotency guard.
 *
 * Reuses the existing lifecycle — inventory is deducted by OrderRepository when
 * items are ADDED to the order (see lib/stock.js), so issuing a KOT never
 * touches stock (never double-consumes). Cancelling a *sent* item either
 * reverses that consumption (not yet prepared) or leaves it consumed as wastage
 * (already prepared). Revenue / AR / VAT post once at payment via the existing
 * split-payment engine — a KOT never posts an accounting entry.
 */

import Database from '@/lib/db/index.js';
import { ensureColumn, serialPkSql } from '@/lib/db/schema-helpers.js';
import { restoreStockForItems } from '@/lib/stock.js';
import { nextDocumentNumber } from '@/lib/document-numbers.js';
import { businessDayIdForExistingWork, currentBusinessDayId } from '@/lib/business-days.js';
import { tableStatusFromOrder } from '@/lib/restaurant-status.js';
import { expandComboItems } from '@/lib/combos.js';
import { ensureRecipeTables, logPreparedItemWastage } from '@/lib/recipes.js';

const ACTIVE = `COALESCE(oi.status, '') NOT IN ('voided', 'cancelled')`;

let schemaReady = false;

/** Idempotently add the immutable-KOT columns + audit log on either driver. */
export async function ensureKotProSchema(db) {
  if (schemaReady && db.driver !== 'sqlite') return; // sqlite dev DB is cheap to re-check
  // Ensure base tables exist (SQLite dev DBs create them lazily elsewhere too).
  const pk = serialPkSql(db);
  await db.run(`CREATE TABLE IF NOT EXISTS kots (
    ${pk}, kot_number TEXT, order_id INTEGER NOT NULL, station TEXT DEFAULT 'main',
    status TEXT DEFAULT 'pending', prepared_by INTEGER,
    printed_at ${db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
    started_at ${db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'},
    completed_at ${db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'})`).catch(() => {});
  await db.run(`CREATE TABLE IF NOT EXISTS kot_items (
    ${pk}, kot_id INTEGER NOT NULL, order_item_id INTEGER, menu_item_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1, special_instructions TEXT, status TEXT DEFAULT 'pending')`).catch(() => {});

  // Each ensure is soft — cPanel app users often cannot ALTER tables they don't own.
  await ensureColumn(db, 'order_items', 'sent_quantity', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'order_items', 'variant_name', 'TEXT');
  await ensureColumn(db, 'orders', 'party_label', 'TEXT');

  for (const [col, ddl] of [
    ['sequence', 'INTEGER DEFAULT 1'], ['table_id', 'INTEGER'], ['table_number', 'TEXT'],
    ['order_type', 'TEXT'], ['kot_type', "TEXT DEFAULT 'new'"], ['issued_by', 'INTEGER'],
    ['issued_by_name', 'TEXT'], ['order_notes', 'TEXT'], ['reprint_count', 'INTEGER DEFAULT 0'],
    ['last_printed_at', db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'],
    ['amends_kot_id', 'INTEGER'], ['voided', 'INTEGER DEFAULT 0'], ['idempotency_key', 'TEXT'],
    ['void_reason', 'TEXT'], ['voided_at', db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'],
    ['cancel_reason', 'TEXT'], ['cancelled_at', db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'],
    ['cancelled_by', 'INTEGER'], ['previous_status', 'TEXT'],
  ]) {
    try { await ensureColumn(db, 'kots', col, ddl); } catch (e) {
      console.warn(`ensureKotProSchema(kots.${col}):`, e?.message || e);
    }
  }

  for (const [col, ddl] of [
    ['item_name', 'TEXT'], ['variant_name', 'TEXT'], ['is_cancellation', 'INTEGER DEFAULT 0'], ['combo_units', 'INTEGER'],
  ]) {
    try { await ensureColumn(db, 'kot_items', col, ddl); } catch (e) {
      console.warn(`ensureKotProSchema(kot_items.${col}):`, e?.message || e);
    }
  }

  await db.run(
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_kots_idempotency_key ON kots(idempotency_key)' +
      (db.driver === 'postgres' ? ' WHERE idempotency_key IS NOT NULL' : '')
  ).catch(() => {});

  await db.run(`CREATE TABLE IF NOT EXISTS pos_audit_log (
    ${pk}, action TEXT NOT NULL, actor_id INTEGER, actor_name TEXT, order_id INTEGER,
    table_id INTEGER, kot_id INTEGER, bill_id INTEGER, reason TEXT,
    previous_value TEXT, new_value TEXT, detail TEXT,
    created_at ${db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});

  schemaReady = true;
}

/** Append-only audit event. Best-effort — never breaks the caller. */
export async function logPosEvent(db, event = {}) {
  try {
    await ensureKotProSchema(db);
    await db.run(
      `INSERT INTO pos_audit_log
        (action, actor_id, actor_name, order_id, table_id, kot_id, bill_id, reason, previous_value, new_value, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        event.action, event.actor_id ?? null, event.actor_name ?? null, event.order_id ?? null,
        event.table_id ?? null, event.kot_id ?? null, event.bill_id ?? null, event.reason ?? null,
        event.previous_value != null ? String(event.previous_value) : null,
        event.new_value != null ? String(event.new_value) : null,
        event.detail != null ? (typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail)) : null,
      ]
    );
  } catch (e) {
    // Audit must never take down the primary operation.
    console.error('pos_audit_log insert failed:', e?.message);
  }
}

/** Rows of a KOT snapshot, joined to the order line for the current live status. */
async function kotItems(db, kotId) {
  return db.all(
    `SELECT ki.*, ki.id AS kot_item_id,
            COALESCE(ki.item_name, oi.item_name, mi.name) AS item_name,
            COALESCE(ki.variant_name, oi.variant_name) AS variant_name
     FROM kot_items ki
     LEFT JOIN order_items oi ON ki.order_item_id = oi.id
     LEFT JOIN menu_items mi ON COALESCE(ki.menu_item_id, oi.menu_item_id, oi.item_id) = mi.id
     WHERE ki.kot_id = ? ORDER BY ki.id`,
    [kotId]
  );
}

/** One KOT with its immutable line snapshot. */
async function getKot(db, kotId) {
  await ensureKotProSchema(db);
  const kot = await db.get(
    `SELECT k.*, k.id AS kot_id, COALESCE(k.kot_number, 'KOT-' || k.id) AS kot_number,
            o.order_number
     FROM kots k LEFT JOIN orders o ON k.order_id = o.id WHERE k.id = ?`,
    [kotId]
  );
  if (!kot) return null;
  kot.items = await kotItems(db, kotId);
  return kot;
}

/** All KOTs for an order, newest first, each with its snapshot lines. */
async function getKotsForOrder(db, orderId) {
  await ensureKotProSchema(db);
  const kots = await db.all(
    `SELECT k.*, k.id AS kot_id, COALESCE(k.kot_number, 'KOT-' || k.id) AS kot_number
     FROM kots k WHERE k.order_id = ? ORDER BY k.sequence ASC, k.id ASC`,
    [orderId]
  );
  for (const k of kots) k.items = await kotItems(db, k.kot_id);
  return kots;
}

/**
 * Full POS workspace for one order: header, live items (with unsent quantity),
 * KOT history and the current bill / payment state.
 */
export async function getOrderWorkspace(db, orderId) {
  await ensureKotProSchema(db);
  const order = await db.get(
    `SELECT o.*, o.id AS order_id, COALESCE(t.table_number, o.table_number) AS table_number,
            t.id AS table_id
     FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?`,
    [orderId]
  );
  if (!order) return null;

  const items = await db.all(
    `SELECT oi.*, oi.id AS order_item_id,
            COALESCE(oi.item_name, mi.name) AS item_name,
            COALESCE(oi.sent_quantity, 0) AS sent_quantity,
            (oi.quantity - COALESCE(oi.sent_quantity, 0)) AS unsent_quantity,
            mi.image_url AS image_url, mi.category_id AS category_id, mc.name AS category
     FROM order_items oi
     LEFT JOIN menu_items mi ON COALESCE(oi.menu_item_id, oi.item_id) = mi.id
     LEFT JOIN menu_categories mc ON mi.category_id = mc.id
     WHERE oi.order_id = ? AND ${ACTIVE}
     ORDER BY oi.id`,
    [orderId]
  );

  const kots = await getKotsForOrder(db, orderId);
  const bill = await db.get(
    `SELECT * FROM bills WHERE order_id = ? ORDER BY
       CASE WHEN status = 'reopened' THEN 0 WHEN status = 'paid' THEN 1 ELSE 2 END,
       id DESC LIMIT 1`,
    [orderId]
  );
  let allocations = [];
  if (bill) {
    allocations = await db.all(
      `SELECT method, amount, provider, reference_number AS reference, due_date
       FROM bill_payment_allocations WHERE bill_id = ? ORDER BY id`,
      [bill.id]
    ).catch(() => []);
  }

  const unsentCount = items.reduce((n, it) => n + Math.max(0, Number(it.unsent_quantity) || 0), 0);
  const isReopened = String(bill?.status || '').toLowerCase() === 'reopened';
  let alreadyPaid = 0;
  if (isReopened && bill) {
    const paidRow = await db.get(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM bill_payments WHERE bill_id = ?`,
      [bill.id]
    ).catch(() => null);
    alreadyPaid = Number(paidRow?.s ?? bill.grand_total ?? 0);
  }

  return {
    order,
    items,
    kots,
    bill: bill || null,
    payments: allocations,
    unsent_count: unsentCount,
    kot_count: kots.filter((k) => !k.voided && k.kot_type !== 'cancellation').length,
    reopened: isReopened,
    already_paid: alreadyPaid,
    reopen_original: isReopened && bill ? {
      subtotal: Number(bill.subtotal || 0),
      discount: Number(bill.discount_amount || 0),
      tax: Number(bill.tax ?? bill.vat_amount ?? 0),
      tax_percent: Number(bill.tax_percent || 0),
      service_charge: Number(bill.service_charge || 0),
      service_charge_percent: Number(bill.service_charge_percent || 0),
      delivery_fee: Number(bill.delivery_fee || 0),
      grand_total: Number(bill.grand_total || 0),
    } : null,
  };
}

const fail = (message, status = 400, code = null) =>
  { throw Object.assign(new Error(message), { status, code }); };

async function assertCurrentDayRecord(db, table, id) {
  return businessDayIdForExistingWork(db, table, id);
}

/**
 * After a KOT or a sent item is cancelled, the order/table can be left in a
 * stale "cooking"/"preparing" state even though nothing is left to cook:
 *  - cancelling an item doesn't touch the original KOT it was issued on, so
 *    that ticket sits "pending" on the kitchen board forever for food that
 *    will never be made — auto-resolve it once every item on it is gone.
 *  - the order/table status then needs to fall back to reflect what (if
 *    anything) is actually still being prepared.
 * Called at the end of cancelKot/cancelSentItem, inside their transaction.
 */
async function reconcileOrderAfterKotChange(tx, orderId) {
  const order = await tx.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order || ['completed', 'cancelled'].includes(String(order.status || ''))) return;

  const openKots = await tx.all(
    `SELECT id FROM kots WHERE order_id = ? AND COALESCE(voided, 0) = 0
       AND COALESCE(kot_type, 'new') != 'cancellation' AND COALESCE(status, 'pending') IN ('pending', 'preparing')`,
    [orderId]
  );
  for (const kot of openKots) {
    const unresolved = await tx.get(
      `SELECT COUNT(*) AS n FROM kot_items ki
         JOIN order_items oi ON oi.id = ki.order_item_id
        WHERE ki.kot_id = ? AND COALESCE(ki.is_cancellation, 0) = 0
          AND COALESCE(oi.status, '') NOT IN ('voided', 'cancelled')`,
      [kot.id]
    );
    if (Number(unresolved?.n || 0) === 0) {
      await tx.run(
        `UPDATE kots SET status = 'cancelled', voided = 1, previous_status = status,
           void_reason = COALESCE(void_reason, 'All items on this ticket were cancelled.'),
           voided_at = COALESCE(voided_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [kot.id]
      );
    }
  }

  const activeKot = await tx.get(
    `SELECT id FROM kots WHERE order_id = ? AND COALESCE(voided, 0) = 0
       AND COALESCE(kot_type, 'new') != 'cancellation' AND COALESCE(status, 'pending') IN ('pending', 'preparing')
       LIMIT 1`,
    [orderId]
  );
  const sentLeft = await tx.get(
    `SELECT COALESCE(SUM(COALESCE(sent_quantity, 0)), 0) AS sent FROM order_items
      WHERE order_id = ? AND COALESCE(status, '') NOT IN ('voided', 'cancelled')`,
    [orderId]
  );
  const stillPreparing = ['preparing', 'ready', 'dining', 'served'].includes(String(order.status || ''));
  if (!activeKot && Number(sentLeft?.sent || 0) <= 0 && stillPreparing) {
    await tx.run(`UPDATE orders SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
    if (order.table_id) {
      await tx.run(
        `UPDATE tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [tableStatusFromOrder('pending'), order.table_id]
      ).catch(() => {});
    }
  }
}

/**
 * Cancel a *sent* order line (already on a KOT). Requires a reason, keeps the
 * original KOT untouched, writes a cancellation KOT, and reverses inventory
 * only when the item was not yet prepared.
 */
export async function cancelSentItem(db, { orderId, orderItemId, quantity = null, reason, prepared = false, actor = {} }) {
  await ensureKotProSchema(db);
  if (prepared) await ensureRecipeTables(db);
  await assertCurrentDayRecord(db, 'orders', orderId);
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) fail('A reason is required to cancel a sent item.', 400, 'reason_required');

  const outcome = await db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const order = await tx.get(`SELECT * FROM orders WHERE id = ?${lock}`, [orderId]);
    if (!order) fail('This order could not be found.', 404);
    if (['completed', 'cancelled'].includes(String(order.status || ''))) {
      fail('This order can no longer be edited.', 409);
    }
    const item = await tx.get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [orderItemId, orderId]);
    if (!item) fail('Order item not found.', 404);
    if (['voided', 'cancelled'].includes(String(item.status || ''))) fail('This item is already cancelled.', 409);
    if (Number(item.sent_quantity || 0) <= 0) {
      fail('This item was never sent to the kitchen — remove it from the draft instead.', 409, 'not_sent');
    }

    const liveQty = Number(item.quantity);
    const cancelQty = quantity == null ? liveQty : Math.min(liveQty, Math.max(1, parseInt(quantity, 10)));
    const unitPrice = Number(item.price || 0);
    const remaining = liveQty - cancelQty;

    if (remaining <= 0) {
      await tx.run(
        `UPDATE order_items SET status = 'cancelled',
           special_instructions = COALESCE(special_instructions, '') || ?
         WHERE id = ?`,
        [`\nCancelled (${prepared ? 'wastage' : 'stock returned'}): ${cleanReason}`, orderItemId]
      );
    } else {
      await tx.run(
        `UPDATE order_items SET quantity = ?, subtotal = ?, sent_quantity = ?,
           special_instructions = COALESCE(special_instructions, '') || ?
         WHERE id = ?`,
        [remaining, unitPrice * remaining, remaining, `\nReduced by ${cancelQty} (${cleanReason})`, orderItemId]
      );
    }

    // Inventory: reverse consumption only when the food was not yet prepared.
    // Prepared food stays consumed (recorded as wastage) — never auto-returned.
    if (!prepared) {
      await restoreStockForItems(tx, [{
        menu_item_id: item.menu_item_id || item.item_id,
        item_name: item.item_name,
        variant_name: item.variant_name,
        quantity: cancelQty,
        combo_snapshot: item.combo_snapshot,
      }], { orderId, reason: `Sent item cancelled before prep: ${cleanReason}` });
    }

    const seqRow = await tx.get('SELECT COALESCE(MAX(sequence), 0) AS m FROM kots WHERE order_id = ?', [orderId]);
    const sequence = Number(seqRow?.m || 0) + 1;
    // A cancellation notice is a ticket for the same channel as its order, so
    // it carries the same prefix — K-D-014 cancels against K-D-011.
    const kotNumber = await nextDocumentNumber(tx, { type: 'kot', prefix: 'KOT', order });
    // Link the cancellation notice to the KOT that actually sent this line.
    // Linking to the newest ticket makes history look like an unrelated or
    // duplicate cancellation whenever several tickets exist on one order.
    const sourceKot = await tx.get(
      `SELECT ki.kot_id AS id
         FROM kot_items ki
         JOIN kots k ON k.id = ki.kot_id
        WHERE ki.order_item_id = ?
          AND COALESCE(ki.is_cancellation, 0) = 0
          AND COALESCE(k.kot_type, 'new') <> 'cancellation'
        ORDER BY k.sequence DESC, k.id DESC
        LIMIT 1`,
      [orderItemId]
    );
    const businessDayId = order.business_day_id || await currentBusinessDayId(tx, { required: true, allowStale: true });
    const ins = await tx.run(
      `INSERT INTO kots
        (kot_number, order_id, station, status, sequence, table_id, table_number, order_type,
         kot_type, issued_by, issued_by_name, order_notes, amends_kot_id, reprint_count, printed_at, last_printed_at, business_day_id)
       VALUES (?, ?, 'main', 'pending', ?, ?, ?, ?, 'cancellation', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
      [kotNumber, orderId, sequence, order.table_id || null, order.table_number || null,
        order.order_type || null, actor.id || null, actor.full_name || actor.name || null,
        `CANCEL: ${cleanReason}${prepared ? ' [WASTAGE]' : ''}`, sourceKot?.id || null, businessDayId]
    );
    const kotId = ins.lastInsertRowid;
    const expanded = await expandComboItems(tx, [{ ...item, quantity: cancelQty }]);
    const isCombo = expanded.some((component) => Number(component.combo_menu_item_id) === Number(item.menu_item_id || item.item_id));
    if (isCombo) {
      for (const component of expanded) {
        await tx.run(
          `INSERT INTO kot_items
            (kot_id, order_item_id, menu_item_id, quantity, special_instructions, status, item_name, variant_name, is_cancellation, combo_units)
           VALUES (?, ?, ?, ?, ?, 'cancelled', ?, ?, 1, ?)`,
          [kotId, orderItemId, component.menu_item_id, component.quantity,
            `Combo: ${item.item_name} | ${cleanReason}`, component.item_name, component.variant_name || null, cancelQty]
        );
      }
    } else {
      await tx.run(
        `INSERT INTO kot_items
          (kot_id, order_item_id, menu_item_id, quantity, special_instructions, status, item_name, variant_name, is_cancellation, combo_units)
         VALUES (?, ?, ?, ?, ?, 'cancelled', ?, ?, 1, NULL)`,
        [kotId, orderItemId, item.menu_item_id || item.item_id || null, cancelQty,
          cleanReason, item.item_name || null, item.variant_name || null]
      );
    }

    const wastage = [];
    if (prepared) {
      for (const component of expanded) {
        if (!(component.menu_item_id || item.menu_item_id || item.item_id) || Number(component.quantity || 0) <= 0) continue;
        wastage.push(await logPreparedItemWastage(tx, {
          menu_item_id: component.menu_item_id || item.menu_item_id || item.item_id || null,
          quantity: Number(component.quantity),
          logged_by: actor.id || null,
          employee_id: actor.id || null,
          business_day_id: businessDayId,
          source_type: 'kot_item_cancellation',
          source_id: kotId,
          notes: `Prepared item cancelled from order ${order.order_number || orderId}: ${cleanReason}`,
        }, { withinTransaction: true }));
      }
    }

    await reconcileOrderAfterKotChange(tx, orderId);

    return {
      kotId, kotNumber, cancelQty, prepared, wastage, table_id: order.table_id,
      item: {
        order_item_id: item.id,
        menu_item_id: item.menu_item_id || item.item_id || null,
        item_name: item.item_name,
        variant_name: item.variant_name,
        quantity: cancelQty,
        price: unitPrice,
        subtotal: unitPrice * cancelQty,
      },
    };
  });

  await logPosEvent(db, {
    action: 'kot_item_cancelled', actor_id: actor.id, actor_name: actor.full_name || actor.name,
    order_id: orderId, table_id: outcome.table_id, kot_id: outcome.kotId,
    reason: cleanReason, detail: { ...outcome.item, prepared: outcome.prepared, wastage_ids: outcome.wastage.map((entry) => entry.id) },
  });
  return { cancellation_kot: await getKot(db, outcome.kotId), workspace: await getOrderWorkspace(db, orderId), wastage: outcome.wastage };
}

