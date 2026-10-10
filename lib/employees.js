/**
 * Primary (first) admin is the oldest admin account by id.
 * That account cannot be deleted or deactivated.
 */

export async function getPrimaryAdminId(db) {
  const row = await db.get(`
    SELECT id FROM users
    WHERE role = 'admin'
    ORDER BY id ASC
    LIMIT 1
  `);
  return row?.id ?? null;
}

export async function isPrimaryAdmin(db, userId) {
  const primaryId = await getPrimaryAdminId(db);
  return primaryId != null && Number(primaryId) === Number(userId);
}

export const RETAIL_STAFF_ROLES = Object.freeze(['admin', 'cashier', 'inventory_staff', 'purchasing_staff', 'accountant', 'manager']);

export function requireRetailStaffRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!RETAIL_STAFF_ROLES.includes(value)) {
    throw Object.assign(new Error('Choose a Retail staff role. Restaurant-only waiter and kitchen accounts are retired.'), { status: 400 });
  }
  return value;
}
