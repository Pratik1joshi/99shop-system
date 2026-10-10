/** Read-only timings against an explicitly supplied disposable PostgreSQL fixture. */
import Database from '../lib/db/index.js';
import { queryRetailStock } from '../lib/retail-stock-query.js';
import { queryRetailMovements } from '../lib/retail-movement-query.js';
import { getReorderSuggestions } from '../lib/retail-inventory-reports.js';
import { searchCommerce } from '../lib/commerce-search.js';

if (!process.env.DATABASE_URL?.includes('phase1c_perf')) throw new Error('Use the phase1c_perf disposable database.');
const db = Database.getInstance();
const time = async (name, run) => {
  const start = performance.now();
  const result = await run();
  console.log(JSON.stringify({ name, elapsed_ms: Math.round(performance.now() - start),
    rows: result.rows?.length ?? result.suggestions?.length ?? result.length ?? result.groups?.length ?? null }));
};
try {
  const counts = await db.get(`SELECT (SELECT COUNT(*) FROM menu_item_variants) AS skus,
    (SELECT COUNT(*) FROM inventory_movements) AS movements`);
  console.log(JSON.stringify(counts));
  await time('stock_first_page', () => queryRetailStock(db, { pageSize: 40 }));
  await time('stock_sku_search', () => queryRetailStock(db, { query: 'PERF-5000', pageSize: 40 }));
  await time('movement_first_page', () => queryRetailMovements(db, { pageSize: 40 }));
  await time('movement_sku_search', () => queryRetailMovements(db, { query: 'PERF-5000', pageSize: 40 }));
  await time('replenishment_all', () => getReorderSuggestions(db));
  await time('universal_sku_search', () => searchCommerce(db, { query: 'PERF-5000', group: 'products', can: () => true }));
} finally { await db.close(); }
