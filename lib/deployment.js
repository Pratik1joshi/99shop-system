/**
 * Deployment profile for the 99 Shop retail counter: which staff roles may
 * sign in and where they land.
 *
 * Env override (optional):
 *   POS_ENABLED_ROLES="admin,cashier" (admin is always included)
 * Keep this module dependency-free so it is safe to import from middleware.
 */

const configuredRoles = (process.env.POS_ENABLED_ROLES || 'admin,cashier,inventory_staff,purchasing_staff,accountant,manager')
  .split(',')
  .map((r) => r.trim().toLowerCase())
  .filter(Boolean);

// admin is always enabled regardless of env configuration.
export const ENABLED_ROLES = Array.from(new Set(['admin', ...configuredRoles]));

/** Primary post-login destination — admin dashboard. */
export const PRIMARY_ROUTE = '/admin/dashboard';

export function isRoleEnabled(role) {
  return ENABLED_ROLES.includes(String(role || '').toLowerCase());
}
