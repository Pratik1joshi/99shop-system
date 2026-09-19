/** Browser-safe page authorization policy for the cashier workspace. */
const CASHIER_PAGE_RULES = [
  ['/cashier/employee-performance', 'employee_performance.view'],
  ['/cashier/expense-categories', 'expense_categories.manage'],
  ['/cashier/business-funding', 'business_funding.manage'],
  ['/cashier/summary-report', 'summary.view'],
  ['/cashier/analytics', 'analytics.view'],
  ['/cashier/promotions', 'promotions.manage'],
  ['/cashier/employees', 'employees.manage'],
  ['/cashier/settings', 'settings.manage'],
  ['/cashier/website', 'cms.manage'],
  ['/cashier/printer', 'settings.manage'],
  ['/cashier/accounts-receivable', 'customer_ledger.access'],
  ['/cashier/accounts-payable', 'supplier_ledger.access'],
  ['/cashier/inventory/dashboard', 'inventory.dashboard.view'],
  ['/cashier/inventory/movements', 'inventory.movements.view'],
  ['/cashier/inventory-categories', 'inventory.setup.manage'],
  ['/cashier/unit-conversion', 'inventory.setup.manage'],
  ['/cashier/reports/compare', 'reports.view'],
  ['/cashier/previous-day-activity', 'report.previous_day.view'],
  ['/cashier/finance-dashboard', 'finance_dashboard.access'],
  ['/cashier/chart-of-accounts', 'chart_of_accounts.access'],
  ['/cashier/bank-reconciliation', 'bank_reconciliation.access'],
  ['/cashier/financial-reports', 'financial_reports.access'],
  ['/cashier/payment-history', 'payments.access'],
  ['/cashier/business-days', 'business_days.view'],
  ['/cashier/hrm/departments', 'hrm.departments.manage'],
  ['/cashier/hrm/designations', 'hrm.designations.manage'],
  ['/cashier/hrm/attendance', 'hrm.attendance.manage'],
  ['/cashier/hrm/holidays', 'hrm.holidays.manage'],
  ['/cashier/general-ledger', 'general_ledger.view'],
  ['/cashier/cash-exchange', 'cash_exchange.manage'],
  ['/cashier/cash-drawer', 'cash_drawer.manage'],
  ['/cashier/products', 'menu.manage'],
  ['/cashier/categories', 'menu.manage'],
  ['/cashier/customers', 'customers.access'],
  ['/cashier/purchases', 'purchases.view'],
  ['/cashier/suppliers', 'suppliers.view'],
  ['/cashier/corrections', 'corrections.manage'],
  ['/cashier/inventory', 'inventory.manage'],
  ['/cashier/delivery', 'delivery.manage'],
  ['/cashier/payroll', 'payroll.view'],
  ['/cashier/expenses', 'expenses.manage'],
  ['/cashier/savings', 'savings.manage'],
  ['/cashier/settlements', 'bank.access'],
  ['/cashier/cash-book', 'general_ledger.view'],
  ['/cashier/bank-book', 'general_ledger.view'],
  ['/cashier/bank', 'bank.access'],
  ['/cashier/wastage', 'wastage.manage'],
  ['/cashier/reports', 'reports.view'],
  ['/cashier/dashboard', 'dashboard.view'],
  ['/cashier/billing', 'bills.access'],
  ['/cashier/bills', 'bills.access'],
  ['/cashier/bill', 'bills.access'],
  ['/cashier/orders', 'order_desk.access'],
  ['/cashier/pos', 'pos.access'],
  ['/cashier', 'order_desk.access'],
].sort((a, b) => b[0].length - a[0].length);

export function permissionForStaffPath(pathname) {
  if (!pathname?.startsWith('/cashier')) return null;
  const match = CASHIER_PAGE_RULES.find(([path]) => (
    pathname === path || (path !== '/cashier' && pathname.startsWith(`${path}/`))
  ));
  return match?.[1] || null;
}

export const CASHIER_PERMISSION_PATHS = Object.freeze(
  CASHIER_PAGE_RULES.map(([path, permission]) => ({ path, permission })),
);
