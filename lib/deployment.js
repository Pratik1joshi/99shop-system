/**
 * Deployment profile for the Shop 99 retail counter.
 *
 * This codebase started as the 99 Shop POS. The accounting, inventory,
 * billing and reporting engine is domain-agnostic and stays; the dine-in
 * workflow (waiters, kitchen tickets, table assignment, reservations, QR
 * table ordering) is off. RETAIL is the only supported mode — the flags
 * remain so the few call sites that branch on them keep working.
 *
 * Env override (optional):
 *   POS_ENABLED_ROLES="admin,cashier" (admin is always included)
 * Keep this module dependency-free so it is safe to import from middleware.
 */

export const SHOP_MODE = 'RETAIL';

const configuredRoles = (process.env.POS_ENABLED_ROLES || 'admin,cashier,inventory_staff,purchasing_staff,accountant,manager')
  .split(',')
  .map((r) => r.trim().toLowerCase())
  .filter(Boolean);

// admin is always enabled regardless of env configuration.
export const ENABLED_ROLES = Array.from(new Set(['admin', ...configuredRoles]));

export const FEATURES = {
  waiterWorkflow: false,
  kitchenDisplay: false,
  kitchenTicket: false,
  requiredTableAssignment: false,
  staffRoleLogin: true,
  reservations: false,
  qrTableOrdering: false,
  counterSaleDefault: true,
};

/** Removed dine-in role landing routes; anyone hitting them goes to the till. */
export const LEGACY_ROLE_ROUTES = ['/waiter', '/kitchen'];

/** Primary post-login destination — admin dashboard. */
export const PRIMARY_ROUTE = '/admin/dashboard';

/** Nav entries hidden in retail mode (by href). */
export const HIDDEN_NAV_HREFS = [
  '/admin/reports?tab=tables',
  '/admin/reports?tab=reservations',
  '/cashier/reports?tab=tables',
  '/cashier/reports?tab=reservations',
];

export function isFeatureEnabled(name) {
  return Boolean(FEATURES[name]);
}

export function isRoleEnabled(role) {
  return ENABLED_ROLES.includes(String(role || '').toLowerCase());
}

export function isNavHidden(href) {
  return HIDDEN_NAV_HREFS.includes(href);
}
