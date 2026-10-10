import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PosDatabase } from '../../lib/db/index.js';
import { AuthService } from '../../lib/auth/auth.js';
import {
  PERMISSION_CATALOG,
  MANAGED_ROLES,
  ensurePermissionCache,
  invalidatePermissionCache,
  listRolePermissions,
  setRolePermissions,
  permissionAuditHistory,
} from '../../lib/permissions.js';
import {
  CASHIER_PERMISSION_PATHS,
  permissionForStaffPath,
} from '../../lib/staff-access-policy.js';

const dbPath = path.join(os.tmpdir(), `permissions-test-${process.pid}-${Date.now()}.db`);
const db = new PosDatabase(dbPath);
const hasPermission = AuthService.prototype.hasPermission.bind({ db });
const admin = { id: 1, full_name: 'Admin One' };

test.after(() => {
  invalidatePermissionCache();
  try { db.close(); } catch { /* already closed */ }
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* already gone */ }
  }
});

test('defaults reproduce today\'s hardcoded behavior before any admin edit', async () => {
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'retail_sale.discount'), true);
  assert.equal(hasPermission('cashier', 'retail_return.post'), true);
  assert.equal(hasPermission('cashier', 'retail_sale.price_override'), false);
  assert.equal(hasPermission('admin', 'retail_sale.price_override'), true); // admin always allowed
  assert.equal(hasPermission('cashier', 'purchases.view'), true);
  assert.equal(hasPermission('cashier', 'suppliers.manage'), true);
  assert.equal(hasPermission('cashier', 'payroll.view'), true);
  assert.equal(hasPermission('cashier', 'payroll.advances.create'), true);
  // Still withheld from every non-admin role, whatever else was granted.
  assert.equal(hasPermission('cashier', 'payroll.payments.create'), false);
});

test('every curated key has a default for every managed role', async () => {
  const { catalog, roles, matrix } = await listRolePermissions(db);
  assert.deepEqual(new Set(catalog.map((c) => c.key)), new Set(PERMISSION_CATALOG.map((c) => c.key)));
  assert.deepEqual(roles, MANAGED_ROLES);
  for (const role of roles) {
    for (const { key } of catalog) {
      assert.equal(typeof matrix[role][key], 'boolean');
    }
  }
});

test('admin can grant a role a previously-blocked action, and it takes effect immediately', async () => {
  invalidatePermissionCache();
  assert.equal(hasPermission('cashier', 'business_days.force_close'), false); // cold-cache fallback matches default

  await setRolePermissions(db, [{ role: 'cashier', key: 'business_days.force_close', allowed: true }], admin);
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'business_days.force_close'), true);
});

test('admin can grant purchasing access to a cashier without granting approval', async () => {
  // Isolation: granting the receiving actions must not drag approval along.
  await setRolePermissions(db, [
    { role: 'cashier', key: 'retail_purchasing.po.create', allowed: true },
    { role: 'cashier', key: 'retail_purchasing.grn.receive', allowed: true },
    { role: 'cashier', key: 'suppliers.manage', allowed: false },
  ], admin);
  invalidatePermissionCache();
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'purchases.view'), true);
  assert.equal(hasPermission('cashier', 'retail_purchasing.po.create'), true);
  assert.equal(hasPermission('cashier', 'retail_purchasing.grn.receive'), true);
  assert.equal(hasPermission('cashier', 'retail_purchasing.po.approve'), false);
  assert.equal(hasPermission('cashier', 'suppliers.manage'), false);
});

test('admin can revoke a role\'s default access', async () => {
  await setRolePermissions(db, [{ role: 'cashier', key: 'retail_return.post', allowed: false }], admin);
  invalidatePermissionCache();
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'retail_return.post'), false);
});

test('payroll actions are independently configurable', async () => {
  await setRolePermissions(db, [
    { role: 'cashier', key: 'payroll.view', allowed: true },
    { role: 'cashier', key: 'payroll.advances.create', allowed: true },
  ], admin);
  invalidatePermissionCache();
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'payroll.view'), true);
  assert.equal(hasPermission('cashier', 'payroll.advances.create'), true);
  assert.equal(hasPermission('cashier', 'payroll.payments.create'), false);
  assert.equal(hasPermission('cashier', 'payroll.records.delete'), false);
});

test('every permission change writes an audit row with before/after values', async () => {
  const rows = await permissionAuditHistory(db);
  const grant = rows.find((r) => r.role === 'cashier' && r.permission_key === 'business_days.force_close');
  assert.ok(grant);
  assert.equal(grant.previous_value, 0);
  assert.equal(grant.new_value, 1);
  assert.equal(grant.actor_name, admin.full_name);

  const revoke = rows.find((r) => r.role === 'cashier' && r.permission_key === 'retail_return.post');
  assert.ok(revoke);
  assert.equal(revoke.previous_value, 1); // default was true, no row existed yet
  assert.equal(revoke.new_value, 0);
});

test('saving the same value again does not write a duplicate audit row', async () => {
  const before = (await permissionAuditHistory(db)).length;
  await setRolePermissions(db, [{ role: 'cashier', key: 'business_days.force_close', allowed: true }], admin); // already true
  const after = (await permissionAuditHistory(db)).length;
  assert.equal(after, before);
});

test('invalid role/key updates are silently ignored, valid ones in the same batch still apply', async () => {
  await setRolePermissions(db, [
    { role: 'not_a_role', key: 'retail_sale.price_override', allowed: true },
    { role: 'cashier', key: 'not_a_key', allowed: true },
    { role: 'cashier', key: 'retail_sale.price_override', allowed: true },
  ], admin);
  invalidatePermissionCache();
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'retail_sale.price_override'), true);
  assert.equal(hasPermission('not_a_role', 'retail_sale.price_override'), false);
});

test('non-curated permission keys are unaffected by this system (static map still governs them)', async () => {
  assert.equal(hasPermission('cashier', 'business_days.open'), true);
  assert.equal(hasPermission('admin', 'anything.not_curated'), true); // admin bypasses the catalog
});

test('individual cashier reports are independently configurable', async () => {
  await setRolePermissions(db, [
    { role: 'cashier', key: 'report.sales.view', allowed: false },
    { role: 'cashier', key: 'report.finance.view', allowed: true },
  ], admin);
  invalidatePermissionCache();
  await ensurePermissionCache(db);
  assert.equal(hasPermission('cashier', 'reports.view'), true);
  assert.equal(hasPermission('cashier', 'report.sales.view'), false);
  assert.equal(hasPermission('cashier', 'report.finance.view'), true);
});

test('permission catalog contains no duplicate or hidden explicit authorization keys', () => {
  const catalogKeys = PERMISSION_CATALOG.map((entry) => entry.key);
  assert.equal(new Set(catalogKeys).size, catalogKeys.length, 'permission keys must be unique');

  const roots = ['app', 'components', 'lib'];
  const files = [];
  const visit = (entry) => {
    for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
      const full = path.join(entry, child.name);
      if (child.isDirectory()) visit(full);
      else if (/\.(?:js|jsx)$/.test(child.name)) files.push(full);
    }
  };
  roots.forEach(visit);

  const used = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:permission|requiredPermission)\s*:\s*['"]([^'"]+)['"]/g)) used.add(match[1]);
    for (const match of source.matchAll(/(?:hasPermission|isPermissionAllowedSync)\([^,]+,\s*['"]([^'"]+)['"]/g)) used.add(match[1]);
    for (const match of source.matchAll(/verifyAuth\(request,\s*['"]([^'"]+)['"]\)/g)) used.add(match[1]);
    for (const match of source.matchAll(/anyPermissions\s*:\s*\[([^\]]+)\]/g)) {
      for (const key of match[1].matchAll(/['"]([^'"]+)['"]/g)) used.add(key[1]);
    }
  }
  const hidden = [...used].filter((key) => !catalogKeys.includes(key));
  assert.deepEqual(hidden, [], `explicit permissions missing from catalog: ${hidden.join(', ')}`);
});

test('every cashier page policy points to a visible permission and respects segment boundaries', () => {
  const catalogKeys = new Set(PERMISSION_CATALOG.map((entry) => entry.key));
  for (const { path: routePath, permission } of CASHIER_PERMISSION_PATHS) {
    assert.ok(catalogKeys.has(permission), `${routePath} uses missing permission ${permission}`);
    assert.equal(permissionForStaffPath(routePath), permission);
  }
  assert.equal(permissionForStaffPath('/cashiered'), null);
  assert.equal(permissionForStaffPath('/cashier/new-unregistered-module'), null);
});

test('every cashier workspace page is registered in the page-access policy', () => {
  const pageFiles = [];
  const visit = (entry) => {
    for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
      const full = path.join(entry, child.name);
      if (child.isDirectory()) visit(full);
      else if (child.name === 'page.jsx' || child.name === 'page.js') pageFiles.push(full);
    }
  };
  visit(path.join('app', 'cashier'));
  for (const file of pageFiles) {
    const relative = path.relative('app', path.dirname(file)).replaceAll(path.sep, '/');
    const samplePath = `/${relative.replace(/\[[^\]]+\]/g, '1')}`;
    assert.ok(permissionForStaffPath(samplePath), `${file} has no cashier page permission`);
  }
});

