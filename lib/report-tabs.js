/**
 * Report tabs, who may open them, and the small request helpers the Reports
 * API shares. The figures themselves come from lib/retail-reporting.js.
 * Browser-safe: no database access here.
 */

export const REPORT_TABS = [
  'overview', 'sales', 'finance', 'expenses', 'purchases', 'orders', 'menu',
  'categories', 'inventory', 'customers', 'employees', 'suppliers', 'changes',
];

/**
 * Tabs a cashier may open by default. /cashier/reports re-exports the admin
 * page, so this is enforced server-side; financial tabs stay admin-only until
 * a role is granted them explicitly.
 */
export const CASHIER_REPORT_TABS = REPORT_TABS.filter((tab) =>
  ['overview', 'sales', 'orders', 'changes', 'menu', 'categories', 'inventory'].includes(tab)
);

export const ADMIN_ONLY_REPORT_TABS = REPORT_TABS.filter((tab) => !CASHIER_REPORT_TABS.includes(tab));

export const REPORT_TAB_PERMISSIONS = Object.freeze(Object.fromEntries(
  REPORT_TABS.map((tab) => [tab, `report.${tab === 'overview' ? 'sales' : tab}.view`])
));

/** Which tabs this role may see. The callback keeps this module browser-safe. */
export function allowedReportTabs(role, can = null) {
  if (role === 'admin') return REPORT_TABS;
  if (typeof can === 'function') return REPORT_TABS.filter((tab) => can(REPORT_TAB_PERMISSIONS[tab]));
  return CASHIER_REPORT_TABS;
}

/** Parse `table_pages` / `table_page_sizes` from the reports API query string. */
export function parseReportTablePaging(searchParams) {
  const readJson = (key) => {
    const raw = searchParams.get(key);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };
  return {
    tablePages: readJson('table_pages'),
    tablePageSizes: readJson('table_page_sizes'),
  };
}

/**
 * Normalise a grouped `date(col)` value to YYYY-MM-DD. node-postgres returns
 * a JS Date for the `date` type; SQLite returns a plain string.
 */
export const dateKey = (v) => {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v ?? '').slice(0, 10);
};
