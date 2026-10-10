/** Browser-safe page authorization policy for the cashier workspace. */
const CASHIER_PAGE_RULES = [
  ['/cashier/retail-transactions', 'retail_sale.view'],
  // Same sellable availability Billing already shows; no cost fields.
  ['/cashier/retail-stock', 'menu.view'],
  ['/cashier/retail-online-orders','retail_online_orders.view'],
  ['/cashier/retail-sales-history', 'retail_sale.view'],
  ['/cashier/employee-performance', 'employee_performance.view'],
  ['/cashier/expense-categories', 'expense_categories.manage'],
  ['/cashier/business-funding', 'business_funding.manage'],
  ['/cashier/summary-report', 'summary.view'],
  ['/cashier/employees', 'employees.manage'],
  ['/cashier/settings', 'settings.manage'],
  ['/cashier/website', 'cms.manage'],
  ['/cashier/printer', 'settings.manage'],
  ['/cashier/accounts-payable', 'supplier_ledger.access'],
  ['/cashier/finance-dashboard', 'finance_dashboard.access'],
  ['/cashier/chart-of-accounts', 'chart_of_accounts.access'],
  ['/cashier/bank-reconciliation', 'bank_reconciliation.access'],
  ['/cashier/financial-reports', 'financial_reports.access'],
  ['/cashier/business-days', 'business_days.view'],
  ['/cashier/retail-registers', 'business_days.view'],
  ['/cashier/hrm/departments', 'hrm.departments.manage'],
  ['/cashier/hrm/designations', 'hrm.designations.manage'],
  ['/cashier/hrm/attendance', 'hrm.attendance.manage'],
  ['/cashier/hrm/holidays', 'hrm.holidays.manage'],
  ['/cashier/general-ledger', 'general_ledger.view'],
  ['/cashier/cash-exchange', 'cash_exchange.manage'],
  ['/cashier/cash-drawer', 'cash_drawer.manage'],
  ['/cashier/products', 'menu.view'],
  ['/cashier/categories', 'menu.manage'],
  ['/cashier/customers', 'customers.access'],
  ['/cashier/purchases', 'purchases.view'],
  ['/cashier/payroll', 'payroll.view'],
  ['/cashier/expenses', 'expenses.manage'],
  ['/cashier/savings', 'savings.manage'],
  ['/cashier/cash-book', 'general_ledger.view'],
  ['/cashier/bank-book', 'general_ledger.view'],
  ['/cashier/bank', 'bank.access'],
  ['/cashier/reports', 'reports.view'],
  ['/cashier/dashboard', 'dashboard.view'],
  ['/cashier/billing', 'retail_pos.use'],
  ['/cashier/retail-pos', 'retail_pos.use'],
  ['/cashier/pos', 'pos.access'],
  ['/cashier', 'dashboard.view'],
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
