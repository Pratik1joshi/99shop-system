import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { isPostgresUrl, requirePostgresInProduction } from './sql.js';
import {
  pgAll,
  pgGet,
  pgRun,
  pgTransaction,
  getPool,
  closePool,
} from './postgres.js';
import { logger } from '../logger.js';
import os from 'os';
import { SQLITE_SCHEMA_DDL, seedDemoData } from './sqlite-seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/** Local SQLite file name. */
const DEFAULT_SQLITE_FILE = 'shop99.db';

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

/**
 * SQLite backend — local/dev only. Not used when DATABASE_URL is set.
 * better-sqlite3 is loaded lazily so production Postgres installs need no native build.
 */
class SqlitePosDatabase {
  constructor(dbPath) {
    let BetterSqlite3;
    let isNodeSqlite = false;
    try {
      BetterSqlite3 = require('better-sqlite3');
    } catch {
      try {
        BetterSqlite3 = require('node:sqlite').DatabaseSync;
        isNodeSqlite = true;
      } catch (err) {
        throw new Error(
          'Neither better-sqlite3 nor node:sqlite is available. For production use DATABASE_URL (PostgreSQL).'
        );
      }
    }

    if (!dbPath) {
      if (process.env.VERCEL === '1') {
        dbPath = path.join(os.tmpdir(), DEFAULT_SQLITE_FILE);
      } else {
        if (process.env.DB_NAME) {
          dbPath = `databases/${process.env.DB_NAME}`;
        }
        const licensePath = path.join(process.cwd(), 'databases', '.license');
        if (!dbPath && fs.existsSync(licensePath)) {
          try {
            const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
            dbPath = `databases/${licenseData.db_name}`;
          } catch (error) {
            logger.warn('license_read_failed', { message: error.message });
          }
        }
        if (!dbPath) dbPath = DEFAULT_SQLITE_FILE;
      }
    }

    const fullPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    const dbExists = fs.existsSync(fullPath);
    logger.info('sqlite_open', { path: path.basename(fullPath), driver: isNodeSqlite ? 'node:sqlite' : 'better-sqlite3' });

    this.driver = 'sqlite';
    this.isNodeSqlite = isNodeSqlite;
    
    if (isNodeSqlite) {
      this.db = new BetterSqlite3(fullPath);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA foreign_keys = ON');
    } else {
      this.db = new BetterSqlite3(fullPath, {
        verbose: process.env.DEBUG_SQL === '1' ? (msg) => logger.debug('sql', { msg }) : null,
      });
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    }

    // Auto-init schema and seed demo data if users table doesn't exist
    let usersExist = false;
    try {
      const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
      if (row) usersExist = true;
    } catch (e) {
      // Table doesn't exist
    }

    this.renameProductTables();

    if (!usersExist) {
      logger.info('sqlite_initializing_schema_and_seeding');
      try {
        this.db.exec(SQLITE_SCHEMA_DDL);
        seedDemoData(this.db);
        logger.info('sqlite_initializing_complete');
      } catch (err) {
        logger.error('sqlite_initializing_failed', { message: err.message, stack: err.stack });
      }
    }
    this.dropRetiredTables();
  }

  /** SQLite counterpart of migration 118: product names for tables and catalog permissions. */
  renameProductTables() {
    const tables = new Set(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    for (const [from, to] of [['menu_categories', 'product_categories'], ['menu_items', 'products'], ['menu_item_variants', 'product_variants']]) {
      if (tables.has(from) && !tables.has(to)) this.db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    }
    const hasColumn = (table, column) => this.db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(table, column);
    for (const [table, from, to] of [
      ['product_variants', 'menu_item_id', 'product_id'],
      ['product_barcodes', 'menu_item_id', 'product_id'],
      ['product_categories', 'food_group', 'category_group'],
    ]) {
      if (hasColumn(table, from) && !hasColumn(table, to)) this.db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
    }
    if (tables.has('role_permissions')) {
      for (const [from, to] of [['menu.view', 'catalog.view'], ['menu.manage', 'catalog.manage'], ['report.menu.view', 'report.products.view']]) {
        this.db.prepare(`UPDATE OR IGNORE role_permissions SET permission_key = ? WHERE permission_key = ?`).run(to, from);
        this.db.prepare(`DELETE FROM role_permissions WHERE permission_key = ?`).run(from);
      }
    }
  }

  /** SQLite counterpart of migration 117: these tables are no longer used. */
  dropRetiredTables() {
    const tables = [
      'bill_audit', 'bill_corrections', 'bill_payment_allocations', 'bill_payments', 'bill_revisions', 'bills',
      'cancellation_verifications', 'delivery_executives', 'inquiries', 'inventory_categories', 'inventory_items',
      'kot_items', 'kots', 'menu_combo_items', 'menu_combos', 'order_items', 'orders', 'pos_audit_log',
      'purchase_change_audit', 'purchase_items', 'purchases', 'recipe_items', 'recipes', 'reservations',
      'review_answers', 'review_questions', 'review_forms', 'customer_reviews', 'stock_items', 'stock_movements',
      'table_floors', 'table_types', 'tables', 'unit_conversions', 'waiter_requests', 'wastage_log',
    ];
    const present = new Set(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    if (!tables.some((name) => present.has(name))) return;
    // Old demo rows may still point at these tables; the drop is not a delete.
    this.db.exec('PRAGMA foreign_keys = OFF');
    try {
      for (const name of tables) if (present.has(name)) this.db.exec(`DROP TABLE IF EXISTS "${name}"`);
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  async run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const p = Array.isArray(params) ? params : [params];
    return this.isNodeSqlite ? stmt.run(...p) : stmt.run(p);
  }

  async get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const p = Array.isArray(params) ? params : [params];
    return this.isNodeSqlite ? stmt.get(...p) : stmt.get(p);
  }

  async all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const p = Array.isArray(params) ? params : [params];
    return this.isNodeSqlite ? stmt.all(...p) : stmt.all(p);
  }

  async transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    const isNode = this.isNodeSqlite;
    return {
      all: async (...args) => {
        const p = normalizeParams(args);
        return isNode ? stmt.all(...p) : stmt.all(p);
      },
      get: async (...args) => {
        const p = normalizeParams(args);
        return isNode ? stmt.get(...p) : stmt.get(p);
      },
      run: async (...args) => {
        const p = normalizeParams(args);
        return isNode ? stmt.run(...p) : stmt.run(p);
      },
    };
  }

  close() {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}

class PostgresPosDatabase {
  constructor() {
    this.driver = 'postgres';
    this.pool = getPool();
    this.db = {
      prepare: (sql) => this.prepare(sql),
    };
    logger.info('postgres_open', { poolMax: process.env.PG_POOL_MAX || '5' });
  }

  prepare(sql) {
    return {
      all: async (...args) => pgAll(sql, normalizeParams(args)),
      get: async (...args) => pgGet(sql, normalizeParams(args)),
      run: async (...args) => pgRun(sql, normalizeParams(args)),
    };
  }

  async run(sql, params = []) {
    return pgRun(sql, params);
  }

  async get(sql, params = []) {
    return pgGet(sql, params);
  }

  async all(sql, params = []) {
    return pgAll(sql, params);
  }

  async transaction(fn) {
    return pgTransaction(async (tx) => fn(tx));
  }

  async close() {
    await closePool();
  }
}

function createDatabase() {
  requirePostgresInProduction();
  if (isPostgresUrl()) {
    return new PostgresPosDatabase();
  }
  // During production build without DATABASE_URL, return a stub that fails on use
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.SKIP_DB_ON_BUILD === '1') {
    return {
      driver: 'build-stub',
      async run() {
        throw new Error('Database unavailable during build');
      },
      async get() {
        throw new Error('Database unavailable during build');
      },
      async all() {
        throw new Error('Database unavailable during build');
      },
      async transaction() {
        throw new Error('Database unavailable during build');
      },
      prepare() {
        throw new Error('Database unavailable during build');
      },
      close() {},
    };
  }
  return new SqlitePosDatabase();
}

class Database {
  static instance = null;

  static getInstance() {
    if (!Database.instance) {
      Database.instance = createDatabase();
    }
    return Database.instance;
  }

  static isPostgres() {
    return isPostgresUrl();
  }

  static async close() {
    if (Database.instance?.close) {
      await Database.instance.close();
    }
    Database.instance = null;
  }
}

export { SqlitePosDatabase as PosDatabase };
export default Database;
