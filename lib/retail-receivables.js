/** Retail credit settlement. Customer-tagged AR journals are the control ledger;
 * sale amount_due is the operational projection for allocating collections. */
import { currentDrawerId, paymentAccountCode, postJournal, primaryBankAccountId } from '@/lib/accounting.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

async function lockedCreditSale(tx, saleId) {
  const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
  const sale = await tx.get(`SELECT * FROM retail_sales WHERE id=?${lock}`, [saleId]);
  if (!sale) throw bad('Retail sale not found.', 404);
  if (sale.status !== 'COMPLETED' || !sale.customer_id) throw bad('Choose a completed credit sale with a customer.', 409);
  return sale;
}

export async function ensureRetailCreditCollectionsSchema(db) {
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_credit_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, collection_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL, amount NUMERIC(14,2) NOT NULL, method TEXT NOT NULL,
    bank_account_id INTEGER, payment_reference TEXT, external_ref TEXT UNIQUE NOT NULL,
    journal_id INTEGER, business_day_id INTEGER, created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_credit_collection_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id INTEGER NOT NULL,
    retail_sale_id INTEGER NOT NULL, amount NUMERIC(14,2) NOT NULL,
    UNIQUE (collection_id, retail_sale_id)
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_credit_writeoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, retail_sale_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL, amount NUMERIC(14,2) NOT NULL,
    reason TEXT NOT NULL, external_ref TEXT UNIQUE NOT NULL,
    journal_id INTEGER, created_by INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function loadCollection(db, id) {
  const collection = await db.get(`SELECT cc.*,c.name AS customer_name FROM retail_credit_collections cc JOIN customers c ON c.id=cc.customer_id WHERE cc.id=?`, [id]);
  const allocations = await db.all(`SELECT a.retail_sale_id AS sale_id,s.sale_number,a.amount,s.amount_due AS remaining
    FROM retail_credit_collection_allocations a JOIN retail_sales s ON s.id=a.retail_sale_id
    WHERE a.collection_id=? ORDER BY a.id`, [id]);
  const outstanding = await db.get(`SELECT COALESCE(SUM(amount_due),0) AS amount FROM retail_sales WHERE customer_id=? AND status='COMPLETED'`, [collection.customer_id]);
  return { ...collection, amount: round2(collection.amount), allocations, outstanding: round2(outstanding.amount),
    journalId: collection.journal_id, customerId: collection.customer_id,
    collectionNumber: collection.collection_number };
}

export async function getRetailCollection(db, id) {
  await ensureRetailCreditCollectionsSchema(db);
  if (!Number.isInteger(Number(id)) || Number(id) < 1) throw bad('Invalid collection number.');
  const exists = await db.get(`SELECT id FROM retail_credit_collections WHERE id=?`, [id]);
  if (!exists) throw bad('Collection not found.', 404);
  return loadCollection(db, id);
}

/** One collection can settle several sales. No sale or revenue journal is posted. */
export async function collectRetailCredits(db, { customerId, allocations, method = 'cash', bankAccountId = null,
  reference = null, actorId = null, businessDayId = null, externalRef = null }) {
  if (!String(externalRef || '').trim()) throw bad('Missing retail credit collection key.');
  if (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0 || !Array.isArray(allocations) || !allocations.length)
    throw bad('Choose a customer and open receivables.');
  const ordered = [...allocations].sort((a, b) => Number(a.saleId ?? a.sale_id) - Number(b.saleId ?? b.sale_id));
  const saleIds = ordered.map((row) => Number(row.saleId ?? row.sale_id));
  const amounts = ordered.map((row) => round2(row.amount));
  if (saleIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(saleIds).size !== saleIds.length ||
      amounts.some((amount) => !(amount > 0))) throw bad('Choose distinct sales with positive allocations.');
  const total = round2(amounts.reduce((sum, value) => sum + value, 0));
  const code = paymentAccountCode(method);
  if (code === '1300' || code === '2030') throw bad('Credit cannot be collected with another liability method.');
  await ensureRetailCreditCollectionsSchema(db);
  return db.transaction(async (tx) => {
    const existing = await tx.get(`SELECT id,customer_id,amount,method,bank_account_id,payment_reference FROM retail_credit_collections WHERE external_ref=?`, [externalRef]);
    if (existing) {
      if (Number(existing.customer_id) !== Number(customerId) || Math.abs(Number(existing.amount) - total) > 0.005 || existing.method !== method)
        throw bad('Collection key was already used for a different payment.', 409);
      const prior = await tx.all(`SELECT retail_sale_id,amount FROM retail_credit_collection_allocations WHERE collection_id=? ORDER BY retail_sale_id`, [existing.id]);
      if (prior.length !== saleIds.length || prior.some((row, index) => Number(row.retail_sale_id) !== saleIds[index] || Math.abs(Number(row.amount) - amounts[index]) > 0.005))
        throw bad('Collection key was already used for different allocations.', 409);
      return loadCollection(tx, existing.id);
    }
    const sales = [];
    for (let index = 0; index < saleIds.length; index += 1) {
      const sale = await lockedCreditSale(tx, saleIds[index]);
      if (Number(sale.customer_id) !== Number(customerId)) throw bad('Every selected sale must belong to this customer.', 409);
      if (amounts[index] > Number(sale.amount_due) + 0.005) throw bad(`Only ${round2(sale.amount_due)} remains on ${sale.sale_number}.`, 409);
      sales.push(sale);
    }
    const day = businessDayId || await currentBusinessDayId(tx, { required: true });
    const drawerId = code === '1010' ? await currentDrawerId(tx) : null;
    const selectedBank = code === '1020' ? Number(bankAccountId || await primaryBankAccountId(tx)) : null;
    if (code === '1020' && !(await tx.get(`SELECT id FROM bank_accounts WHERE id=?`, [selectedBank]))) throw bad('Choose a valid bank or settlement account.');
    const collectionNumber = await nextDocumentNumber(tx, { type: 'retail_credit_collection', prefix: 'COL' });
    const result = await tx.run(`INSERT INTO retail_credit_collections
      (collection_number,customer_id,amount,method,bank_account_id,payment_reference,external_ref,business_day_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [collectionNumber, customerId, total, method, selectedBank, reference, externalRef, day, actorId]);
    const collectionId = result.lastInsertRowid;
    const journal = await postJournal(tx, { memo: `Retail credit collection — ${collectionNumber}`,
      source_type: 'retail_credit_collection', source_id: collectionId, external_ref: externalRef,
      created_by: actorId, business_day_id: day,
      lines: [
        { code, debit: total, credit: 0, drawer_id: drawerId, bank_account_id: selectedBank, memo: reference || collectionNumber },
        { code: '1300', debit: 0, credit: total, customer_id: customerId, memo: `Receivables settled — ${collectionNumber}` },
      ] });
    await tx.run(`UPDATE retail_credit_collections SET journal_id=? WHERE id=?`, [journal.id, collectionId]);
    for (let index = 0; index < sales.length; index += 1) {
      await tx.run(`INSERT INTO retail_credit_collection_allocations (collection_id,retail_sale_id,amount) VALUES (?,?,?)`,
        [collectionId, sales[index].id, amounts[index]]);
      await tx.run(`UPDATE retail_sales SET amount_paid=amount_paid+?,amount_due=amount_due-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [amounts[index], amounts[index], sales[index].id]);
    }
    return loadCollection(tx, collectionId);
  });
}

/** Single-sale compatibility entry point. */
export async function collectRetailCredit(db, { saleId, amount, method = 'cash', reference = null,
  actorId = null, businessDayId = null, externalRef = null }) {
  const sale = await lockedCreditSale(db, saleId);
  const collection = await collectRetailCredits(db, { customerId: sale.customer_id,
    allocations: [{ saleId, amount }], method, reference, actorId, businessDayId, externalRef });
  return { ...collection, saleId: sale.id, collected: collection.amount,
    remaining: round2(collection.allocations[0].remaining) };
}

export async function writeOffRetailCredit(db, { saleId, amount, reason, actorId = null,
  businessDayId = null, externalRef = null }) {
  const value = round2(amount);
  if (!(value > 0)) throw bad('Write-off amount must be greater than zero.');
  if (!String(reason || '').trim()) throw bad('A write-off reason is required.');
  if (!String(externalRef || '').trim()) throw bad('Missing retail credit write-off key.');
  await ensureRetailCreditCollectionsSchema(db);
  return db.transaction(async (tx) => {
    const existing = await tx.get(`SELECT * FROM retail_credit_writeoffs WHERE external_ref=?`, [externalRef]);
    if (existing) {
      if (Number(existing.retail_sale_id) !== Number(saleId) || Math.abs(Number(existing.amount) - value) > 0.005)
        throw bad('Write-off key was already used for a different amount or sale.', 409);
      return { saleId, writtenOff: value, journalId: existing.journal_id, idempotent: true };
    }
    const sale = await lockedCreditSale(tx, saleId);
    const due = round2(sale.amount_due);
    if (value > due + 0.005) throw bad(`This sale is only owed ${due}.`, 409);
    const day = businessDayId || sale.business_day_id || await currentBusinessDayId(tx, { required: true });
    const result = await tx.run(`INSERT INTO retail_credit_writeoffs
      (retail_sale_id,customer_id,amount,reason,external_ref,created_by) VALUES (?,?,?,?,?,?)`,
      [sale.id, sale.customer_id, value, reason, externalRef, actorId]);
    const journal = await postJournal(tx, {
      memo: `Retail credit write-off — ${sale.sale_number || sale.id}: ${reason}`,
      source_type: 'retail_credit_writeoff', source_id: result.lastInsertRowid,
      external_ref: externalRef, created_by: actorId, business_day_id: day,
      lines: [
        { code: '5070', debit: value, credit: 0, memo: reason },
        { code: '1300', debit: 0, credit: value, customer_id: sale.customer_id, memo: 'Retail receivable written off' },
      ],
    });
    await tx.run(`UPDATE retail_credit_writeoffs SET journal_id=? WHERE id=?`, [journal.id, result.lastInsertRowid]);
    await tx.run(`UPDATE retail_sales SET amount_due=amount_due-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [value, sale.id]);
    return { saleId: sale.id, customerId: sale.customer_id, writtenOff: value,
      remaining: round2(due - value), journalId: journal.id };
  });
}
