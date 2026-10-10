/**
 * Admin-configurable permissions for staff pages and actions. The catalog is
 * shared by navigation, direct-route guards and API guards so a control is not
 * merely hidden in the UI while remaining callable on the server.
 */
import { ensureColumn, serialPkSql } from './db/schema-helpers.js';
import { ensureSqliteTable } from './db/ensure-sqlite-table.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export const MANAGED_ROLES = ['cashier', 'inventory_staff', 'purchasing_staff', 'accountant', 'manager'];

export const PERMISSION_CATALOG = [
  { key: 'warranty.view', label: 'Warranty: view', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.create', label: 'Warranty: create', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.inspect', label: 'Warranty: inspect', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.approve', label: 'Warranty: approve', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.repair', label: 'Warranty: repair', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.parts', label: 'Warranty: parts', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.replace', label: 'Warranty: replace', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.refund', label: 'Warranty: refund', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.rma', label: 'Warranty: rma', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.close', label: 'Warranty: close', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.cost', label: 'Warranty: cost', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'warranty.configure', label: 'Warranty: configure', category: 'After-Sales', roles: ['cashier'], description: 'Explicit after-sales capability; disabled by default.' },
  { key: 'operations.view', label: 'Operations intelligence', category: 'Intelligence', roles: ['cashier'], description: 'View demand and cost evidence.' },
  { key: 'operations.configure', label: 'Configure forecasting', category: 'Intelligence', roles: ['cashier'], description: 'Edit bounded operations policies.' },
  { key: 'operations.draft', label: 'Replenishment draft', category: 'Intelligence', roles: ['cashier'], description: 'Create a draft purchase order from evidence.' },
  { key: 'orders.view', label: 'View sales', category: 'Sales', description: 'View active and historical sales.' },
  { key: 'orders.create', label: 'Create sales', category: 'Sales', description: 'Start a sale and add its initial items.' },
  { key: 'orders.update', label: 'Update sales', category: 'Sales', description: 'Change sale details, status and unsaved items.' },
  { key: 'orders.cancel', label: 'Cancel a sale', category: 'Sales', description: 'Cancel or void an in-progress sale from the till or admin.' },
  { key: 'orders.cancel_item', label: 'Remove a saved item', category: 'Sales', description: 'Remove an item that is already saved on a sale.' },
  { key: 'menu.view', label: 'View products', category: 'Catalog', description: 'View products and categories while ringing up a sale.' },
  { key: 'bills.view', label: 'View bills', category: 'Billing', description: 'View bill amounts and details.' },
  { key: 'bills.request', label: 'Request a bill', category: 'Billing', description: 'Prepare or request a bill for an open order.' },
  { key: 'bills.pay', label: 'Collect bill payments', category: 'Billing', description: 'Settle a bill using Cash or Online.' },
  { key: 'bills.reprint', label: 'Reprint receipts', category: 'Billing', description: 'Print another copy of a bill or receipt.' },
  { key: 'bills.revise_settlement', label: 'Correct bill settlement', category: 'Billing', roles: ['cashier'], description: 'Correct payment allocations on a settled bill with an audit reason.' },
  { key: 'bills.void', label: 'Void a paid bill', category: 'Billing', description: 'Void a bill that has already been paid.' },
  { key: 'bills.refund', label: 'Refund a bill', category: 'Billing', description: 'Issue a full or partial refund on a bill.' },
  { key: 'bills.reopen', label: 'Reopen a closed bill', category: 'Billing', description: 'Reopen a paid bill to add or change items.' },
  { key: 'bills.discount', label: 'Apply a discount', category: 'Billing', description: 'Apply or override a discount on a bill.' },
  { key: 'credit.writeoff', label: 'Discount customer credit', category: 'Billing', roles: ['cashier'], description: 'Reduce an existing customer credit balance with a recorded reason and audit trail.' },
  { key: 'credit.payment_method_correct', label: 'Correct credit payment method', category: 'Billing', roles: ['cashier'], description: 'Change a received customer-credit payment between Cash and Online. Off for cashiers by default.' },
  { key: 'customers.delete', label: 'Delete a customer', category: 'Cashier: Core', roles: ['cashier'], description: 'Permanently remove a customer record. Off by default — customers with history should normally be kept.' },
  { key: 'purchases.view', label: 'View purchases', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'View purchase history, delivery lines and linked stock/expense records.' },
  { key: 'purchases.create', label: 'Receive a purchase', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Record a received delivery and update inventory and expenses.' },
  { key: 'purchases.import', label: 'Import purchases', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Upload and commit multiple invoice lines from CSV after previewing them.' },
  { key: 'purchases.edit', label: 'Edit a purchase', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Correct an existing delivery and safely re-apply its stock movement.' },
  { key: 'purchases.payment_method_correct', label: 'Correct purchase payment method', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Reclassify how an existing purchase was paid, with a required audit reason. Off by default.' },
  { key: 'purchases.void', label: 'Void a purchase', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Reverse a purchase, its stock and its linked expense.' },
  { key: 'suppliers.view', label: 'View suppliers', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'View supplier contact details and purchase history.' },
  { key: 'suppliers.manage', label: 'Create or edit suppliers', category: 'Purchases & Suppliers', roles: ['cashier'], description: 'Create suppliers and update their contact details. Supplier merging remains admin-only.' },
  { key: 'retail_purchasing.po.create', label: 'Create retail purchase orders', category: 'Retail Purchasing', roles: ['cashier'], description: 'Create and edit draft retail purchase orders. A PO never moves stock by itself.' },
  { key: 'retail_purchasing.po.approve', label: 'Approve retail purchase orders', category: 'Retail Purchasing', roles: ['cashier'], description: 'Approve a draft PO so it can be received against. Off for cashiers by default.' },
  { key: 'retail_purchasing.grn.receive', label: 'Record a goods receipt', category: 'Retail Purchasing', roles: ['cashier'], description: 'Create and post a goods receipt, adding batch/expiry-tracked retail stock.' },
  { key: 'retail_purchasing.grn.over_receipt', label: 'Allow over-receipt', category: 'Retail Purchasing', roles: ['cashier'], description: 'Post a goods receipt for more than the PO line has remaining. Off by default.' },
  { key: 'retail_purchasing.return.create', label: 'Create retail purchase returns', category: 'Retail Purchasing', roles: ['cashier'], description: 'Return retail stock to a supplier and adjust the supplier balance.' },
  { key: 'retail_purchasing.view_cost', label: 'View retail purchase cost', category: 'Retail Purchasing', roles: ['cashier'], description: 'See unit cost and supplier pricing on retail purchase orders and receipts.' },
  { key: 'retail_pos.use', label: 'Use the Retail POS', category: 'Retail Sales', roles: ['cashier'], description: 'Build carts, hold/resume and check out retail sales.' },
  { key: 'retail_sale.view', label: 'View retail sales', category: 'Retail Sales', roles: ['cashier'], description: 'View retail sale history and receipts.' },
  { key: 'retail_sale.discount', label: 'Apply a retail sale discount', category: 'Retail Sales', roles: ['cashier'], description: 'Apply a discount on a retail sale.' },
  { key: 'retail_sale.price_override', label: 'Override retail sale price', category: 'Retail Sales', roles: ['cashier'], description: 'Sell a line at other than its configured price. Off by default.' },
  { key: 'retail_sale.credit', label: 'Sell retail on customer credit', category: 'Retail Sales', roles: ['cashier'], description: 'Complete a retail sale on Accounts Receivable instead of full payment.' },
  { key: 'retail_sale.credit_override', label: 'Override customer credit limit', category: 'Retail Sales', roles: [], description: 'Allow a Manager to exceed a customer credit limit with a reason recorded against the sale.' },
  { key: 'retail_sale.view_cost', label: 'View retail sale cost/COGS', category: 'Retail Sales', roles: ['cashier'], description: 'See unit cost and COGS on retail sales. Off by default.' },
  { key: 'retail_sale.view_profit', label: 'View retail sale gross profit', category: 'Retail Sales', roles: ['cashier'], description: 'See gross margin on retail sales. Off by default.' },
  { key: 'retail_return.create', label: 'Create retail returns', category: 'Retail Returns', roles: ['cashier'], description: 'Start a return or exchange against a completed retail sale.' },
  { key: 'retail_return.post', label: 'Post retail returns', category: 'Retail Returns', roles: ['cashier'], description: 'Finalize a return and issue its refund or store credit.' },
  { key: 'retail_return.non_resellable', label: 'Restock opened/damaged returns', category: 'Retail Returns', roles: ['cashier'], description: 'Allow returning an opened, damaged or expired item back to sellable stock. Off by default.' },
  { key: 'retail_return.without_receipt', label: 'Return without receipt in hand', category: 'Retail Returns', roles: ['cashier'], description: 'Allow a documented exception after the original completed sale has been identified. Off by default.' },
  { key: 'retail_store_credit.adjust', label: 'Adjust store credit', category: 'Retail Returns', roles: ['cashier'], description: 'Manually issue or reduce a customer store credit balance with a reason. Off by default.' },
  { key: 'retail_inventory.view', label: 'View retail inventory operations', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'View transfers, stock counts, adjustments, movement ledger and inventory reports.' },
  { key: 'retail_inventory.view_cost', label: 'View retail inventory cost/value', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'See unit cost and inventory value on transfers, counts and adjustments. Off by default.' },
  { key: 'retail_inventory.transfer.create', label: 'Create stock transfers', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Create a draft transfer between retail locations.' },
  { key: 'retail_inventory.transfer.dispatch', label: 'Dispatch stock transfers', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Dispatch a draft transfer, moving stock out of the source location.' },
  { key: 'retail_inventory.transfer.receive', label: 'Receive stock transfers', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Receive a dispatched transfer at the destination location.' },
  { key: 'retail_inventory.count.create', label: 'Create stock counts', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Start a physical stock count and capture its snapshot.' },
  { key: 'retail_inventory.count.perform', label: 'Perform stock counts', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Enter physical counted quantities against an open count.' },
  { key: 'retail_inventory.count.approve', label: 'Approve & post stock counts', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Review variance and post a stock count, including seeing expected quantities on a blind count. Off by default.' },
  { key: 'retail_inventory.adjust', label: 'Manual inventory adjustment', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Post a found-stock or shortage correction with a reason. Off by default.' },
  { key: 'retail_inventory.damage', label: 'Write off damaged stock', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Record a damage write-off.' },
  { key: 'retail_inventory.expiry', label: 'Write off expired stock', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Record an expiry write-off for an expired batch.' },
  { key: 'retail_inventory.tester', label: 'Convert stock to tester', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Convert sellable stock to a tester unit.' },
  { key: 'retail_inventory.sample', label: 'Record sample/giveaway', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Record a promotional sample or giveaway.' },
  { key: 'retail_inventory.internal_use', label: 'Record internal use', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Record stock consumed internally by the business.' },
  { key: 'retail_inventory.quarantine_release', label: 'Release stock from quarantine', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Move stock into or back out of the quarantine location. Off by default.' },
  { key: 'retail_inventory.print_labels', label: 'Print barcode labels', category: 'Retail Inventory Ops', roles: ['cashier'], description: 'Print product/variant barcode labels.' },
  { key: 'retail_loyalty.adjust', label: 'Adjust loyalty points', category: 'Retail Returns', roles: ['cashier'], description: 'Manually issue or reduce a customer loyalty points balance with a reason. Off by default.' },
  { key: 'retail_online_orders.view', label: 'View online orders', category: 'Retail Online Orders', roles: ['cashier'], description: 'View online/web orders.' },
  { key: 'retail_online_orders.create', label: 'Create online orders', category: 'Retail Online Orders', roles: ['cashier'], description: 'Manually record an online/phone order.' },
  { key: 'retail_online_orders.fulfill', label:'Fulfill online orders',category:'Retail Online Orders',roles:['cashier'],description:'Collect cash and post an online order through Retail sales.' },
  { key: 'retail_online_orders.verify_payment',label:'Verify online bank payments',category:'Retail Online Orders',roles:['cashier'],description:'Verify manual bank or QR payments. Off for cashiers by default.' },
  { key: 'retail_online_orders.manage', label: 'Manage online orders', category: 'Retail Online Orders', roles: ['cashier'], description: 'Confirm, fulfill, cancel and update the status of online orders.' },
  { key: 'retail_analytics.view', label: 'View retail analytics', category: 'Retail Analytics', roles: ['cashier'], description: 'View the executive dashboard and sales/product/customer/returns/purchase reports. Off by default.' },
  { key: 'payroll.view', label: 'View salary & advances', category: 'Payroll', roles: ['cashier'], description: 'View employee salary amounts, advance balances and payroll history.' },
  { key: 'payroll.advances.create', label: 'Give salary advances', category: 'Payroll', roles: ['cashier'], description: 'Pay and record a salary advance for an employee.' },
  { key: 'payroll.payments.create', label: 'Record salary payments', category: 'Payroll', roles: ['cashier'], description: 'Record a salary payment. Off for cashiers by default.' },
  { key: 'payroll.records.delete', label: 'Delete payroll records', category: 'Payroll', roles: ['cashier'], description: 'Delete a salary payment or advance. Off for cashiers by default.' },
  { key: 'reports.view', label: 'Show Reports section', category: 'Reports: Access', roles: ['cashier'], description: 'Show the Reports section in the cashier workspace. Individual reports can be allowed below.' },
  { key: 'report.sales.view', label: 'Sales report', category: 'Reports: Individual', roles: ['cashier'], description: 'View invoices, payment splits, categories and daily sales.' },
  { key: 'report.finance.view', label: 'Finance report', category: 'Reports: Individual', roles: ['cashier'], description: 'View expenses, profit, tax and VAT figures. Off by default.' },
  { key: 'report.expenses.view', label: 'Expenses report', category: 'Reports: Individual', roles: ['cashier'], description: 'View detailed operating expenses. Off by default.' },
  { key: 'report.purchases.view', label: 'Purchases report', category: 'Reports: Individual', roles: ['cashier'], description: 'View received purchase invoices. Off by default.' },
  { key: 'report.suppliers.view', label: 'Suppliers report', category: 'Reports: Individual', roles: ['cashier'], description: 'View supplier-level spending. Off by default.' },
  { key: 'report.orders.view', label: 'Sales progress report', category: 'Reports: Individual', roles: ['cashier'], description: 'View sale progress and sale records.' },
  { key: 'report.changes.view', label: 'Cancellations & changes report', category: 'Reports: Individual', roles: ['cashier'], description: 'View cancellations, voids, refunds, revisions and discounts.' },
  { key: 'report.inventory.view', label: 'Inventory report', category: 'Reports: Individual', roles: ['cashier'], description: 'View current stock, movements and low-stock records.' },
  { key: 'report.employees.view', label: 'Employees report', category: 'Reports: Individual', roles: ['cashier'], description: 'View employee performance figures. Off by default.' },
  { key: 'report.menu.view', label: 'Product report', category: 'Reports: Individual', roles: ['cashier'], description: 'View item sales, cost, profit and margin.' },
  { key: 'report.categories.view', label: 'Category report', category: 'Reports: Individual', roles: ['cashier'], description: 'View sales, profit and share by category.' },
  { key: 'report.customers.view', label: 'Customers report', category: 'Reports: Individual', roles: ['cashier'], description: 'View customer visits and lifetime value. Off by default.' },
  { key: 'report.previous_day.view', label: 'Previous-day activity report', category: 'Reports: Individual', roles: ['cashier'], description: 'View purchases and expenses belonging to earlier business days, and later changes that touched those days.' },
  { key: 'dashboard.view', label: 'View dashboard', category: 'Manager Workspace', roles: ['cashier'], description: 'View the counter dashboard and open or continue a sale.' },
  { key: 'analytics.view', label: 'View advanced analytics', category: 'Manager Workspace', roles: ['cashier'], description: 'View commercial, product, payment and operational analytics. Off by default.' },
  { key: 'summary.view', label: 'View owner summary', category: 'Manager Workspace', roles: ['cashier'], description: 'View the owner-level period summary. Off by default.' },
  { key: 'menu.manage', label: 'Manage catalog', category: 'Manager Workspace', roles: ['cashier'], description: 'Create and edit products and product categories.' },
  { key: 'promotions.manage', label: 'Manage offers & discounts', category: 'Manager Workspace', roles: ['cashier'], description: 'Create, edit and disable promotions. Off by default.' },
  { key: 'combos.manage', label: 'Manage combo packs', category: 'Manager Workspace', roles: ['cashier'], description: 'Create, edit and disable combo packs. Off by default.' },
  { key: 'delivery.manage', label: 'Manage delivery executives', category: 'Operations', description: 'View, create and update delivery executives and their assigned orders.' },
  { key: 'inventory.dashboard.view', label: 'View inventory dashboard', category: 'Inventory Controls', roles: ['cashier'], description: 'View inventory health, value, movement and consumption analytics.' },
  { key: 'inventory.movements.view', label: 'View stock movements', category: 'Inventory Controls', roles: ['cashier'], description: 'View the complete stock movement and stock-adjustment audit history.' },
  { key: 'inventory.view', label: 'View inventory items', category: 'Inventory Controls', description: 'View stock and inventory item details used by the role.' },
  { key: 'inventory.setup.view', label: 'View inventory setup', category: 'Inventory Controls', description: 'View inventory categories and unit conversions.' },
  { key: 'inventory.manage', label: 'Manage inventory items', category: 'Inventory Controls', roles: ['cashier'], description: 'Create, edit, archive and manually adjust inventory items. Quantity adjustments still require a reason.' },
  { key: 'inventory.setup.manage', label: 'Manage inventory setup', category: 'Inventory Controls', roles: ['cashier'], description: 'Manage inventory categories and unit conversions.' },
  { key: 'wastage.manage', label: 'Record and view wastage', category: 'Inventory Controls', description: 'Record wastage and view the complete wastage history.' },
  { key: 'expenses.manage', label: 'Record and view expenses', category: 'Cash & Accounting', roles: ['cashier'], description: 'View and record operating expenses.' },
  { key: 'expenses.payment_method_correct', label: 'Correct expense payment method', category: 'Cash & Accounting', roles: ['cashier'], description: 'Reclassify how an existing expense was paid, with a required audit reason. Off by default.' },
  { key: 'expense_categories.manage', label: 'Manage expense categories', category: 'Cash & Accounting', roles: ['cashier'], description: 'Create, rename and archive expense categories. Off by default.' },
  { key: 'business_funding.manage', label: 'Manage business funding', category: 'Cash & Accounting', roles: ['cashier'], description: 'Record owner funding and financing activity. Off by default.' },
  { key: 'savings.manage', label: 'Manage savings deposits', category: 'Cash & Accounting', roles: ['cashier'], description: 'View, create and void Savings & Deposits transfers with audit reasons.' },
  { key: 'cash_exchange.manage', label: 'Record cash exchange', category: 'Cash & Accounting', roles: ['cashier'], description: 'View and record note-exchange transactions during an open business day.' },
  { key: 'cash_drawer.manage', label: 'Operate cash drawer', category: 'Cash & Accounting', roles: ['cashier'], description: 'Open and close drawer sessions and record cash-in or cash-out movements.' },
  { key: 'business_days.view', label: 'View opening & closing', category: 'Cash & Accounting', roles: ['cashier'], description: 'View current and historical business-day sessions.' },
  { key: 'business_days.open', label: 'Open business day', category: 'Cash & Accounting', roles: ['cashier'], description: 'Open a new business day.' },
  { key: 'business_days.close', label: 'Close business day', category: 'Cash & Accounting', roles: ['cashier'], description: 'Close a normal business day after its blockers are resolved. Forced closing remains admin-only.' },
  { key: 'business_days.force_close', label: 'Force-close business day', category: 'Cash & Accounting', roles: ['cashier'], description: 'Close despite unresolved operational blockers. Off for cashiers by default.' },
  { key: 'corrections.manage', label: 'Post accounting corrections', category: 'Cash & Accounting', roles: ['cashier'], description: 'View corrections and post audited journal reversals, bill voids and refunds.' },
  { key: 'general_ledger.view', label: 'View general ledger', category: 'Cash & Accounting', roles: ['cashier'], description: 'View journal entries and account ledgers without changing the chart of accounts.' },
  { key: 'hrm.departments.manage', label: 'Manage departments', category: 'HRM', roles: ['cashier'], description: 'Create, edit and remove departments.' },
  { key: 'hrm.designations.manage', label: 'Manage designations', category: 'HRM', roles: ['cashier'], description: 'Create, edit and remove designations.' },
  { key: 'hrm.attendance.manage', label: 'Mark staff attendance', category: 'HRM', roles: ['cashier'], description: 'View and mark the daily staff attendance register.' },
  { key: 'hrm.holidays.manage', label: 'Manage holidays', category: 'HRM', roles: ['cashier'], description: 'Add and remove entries on the holiday calendar.' },
  { key: 'employees.manage', label: 'Manage staff accounts', category: 'HRM', roles: ['cashier'], description: 'Create and update staff profiles and login access. Off by default.' },
  { key: 'employee_performance.view', label: 'View staff performance', category: 'HRM', roles: ['cashier'], description: 'View staff performance and productivity reports. Off by default.' },
  { key: 'cms.manage', label: 'Manage website content', category: 'Administration', roles: ['cashier'], description: 'Edit public website content and media. Off by default.' },
  { key: 'settings.manage', label: 'Manage shop settings', category: 'Administration', roles: ['cashier'], description: 'Change shop and printer settings. Off by default.' },
  { key: 'inventory.import', label: 'Import inventory', category: 'Inventory Controls', roles: ['cashier'], description: 'Import inventory records in bulk. Off by default.' },
  { key: 'pos.access', label: 'Access POS', category: 'Cashier: Core', roles: ['cashier'], description: 'Open the cashier till and create or settle sales.' },
  { key: 'order_desk.access', label: 'Access Sales Desk', category: 'Cashier: Core', roles: ['cashier'], description: 'View the cashier sales desk and current counter activity.' },
  { key: 'customers.access', label: 'Access Customers', category: 'Customer Records', description: 'View and manage customer records.' },
  { key: 'customer_ledger.access', label: 'Access Customer Ledger', category: 'Cashier: Core', roles: ['cashier'], description: 'View and maintain customer receivables.' },
  { key: 'supplier_ledger.access', label: 'Access Supplier Ledger', category: 'Cashier: Core', roles: ['cashier'], description: 'View and maintain supplier payables.' },
  { key: 'online_orders.access', label: 'Access Online Orders', category: 'Cashier: Operations', roles: ['cashier'], description: 'View and process online orders.' },
  { key: 'bills.access', label: 'Access Bills', category: 'Billing', description: 'Open the bill list and bill details available to the role.' },
  { key: 'payments.access', label: 'Access Payments', category: 'Cashier: Operations', roles: ['cashier'], description: 'View payment history.' },
  { key: 'finance_dashboard.access', label: 'Access Finance Dashboard', category: 'Cashier: Accounting', roles: ['cashier'], description: 'View the finance overview and balances.' },
  { key: 'chart_of_accounts.access', label: 'Access Chart of Accounts', category: 'Cashier: Accounting', roles: ['cashier'], description: 'View and manage the chart of accounts.' },
  { key: 'bank_reconciliation.access', label: 'Access Bank Reconciliation', category: 'Cashier: Accounting', roles: ['cashier'], description: 'Reconcile bank statements and ledger lines.' },
  { key: 'bank.access', label: 'Access Bank', category: 'Cashier: Accounting', roles: ['cashier'], description: 'Manage bank accounts and bank transactions.' },
  { key: 'financial_reports.access', label: 'Access Financial Reports', category: 'Cashier: Accounting', roles: ['cashier'], description: 'View financial statements and accounting reports.' },
];
const CATALOG_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));
const CATALOG_BY_KEY = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));
export const DYNAMIC_PERMISSION_KEYS = CATALOG_KEYS;

/** Conservative starting capabilities for distinct Retail staff accounts.
 * Administrators may adjust these in the existing permission matrix. */
const ROLE_PRESETS = Object.freeze({
  inventory_staff: new Set([
    'retail_inventory.view', 'retail_inventory.transfer.create', 'retail_inventory.transfer.dispatch',
    'retail_inventory.transfer.receive', 'retail_inventory.count.create', 'retail_inventory.count.perform',
    'retail_inventory.damage', 'retail_inventory.expiry', 'retail_inventory.quarantine_release',
    'retail_inventory.adjust', 'inventory.view', 'menu.view',
  ]),
  purchasing_staff: new Set([
    'retail_inventory.view', 'retail_purchasing.po.create', 'retail_purchasing.grn.receive',
    'retail_purchasing.return.create', 'retail_purchasing.view_cost', 'suppliers.view', 'suppliers.manage',
    'menu.view',
  ]),
  accountant: new Set([
    'customers.access', 'customer_ledger.access', 'credit.writeoff', 'retail_sale.view', 'suppliers.view', 'supplier_ledger.access',
    'retail_purchasing.view_cost', 'expenses.manage', 'finance_dashboard.access',
    'bank.access', 'bank_reconciliation.access', 'general_ledger.view',
    'chart_of_accounts.access', 'financial_reports.access', 'business_days.view',
    'retail_analytics.view',
  ]),
  manager: new Set([
    'dashboard.view', 'menu.view', 'retail_pos.use', 'retail_sale.view', 'retail_sale.credit', 'retail_sale.credit_override',
    'retail_return.create', 'retail_return.post',
    'retail_inventory.view', 'retail_inventory.count.create', 'retail_inventory.count.perform',
    'retail_inventory.count.approve', 'retail_purchasing.po.approve',
    'retail_purchasing.view_cost', 'customers.access', 'customer_ledger.access', 'suppliers.view',
    'finance_dashboard.access', 'business_days.view', 'retail_analytics.view',
  ]),
});

// Reproduces the role arrays / in-handler checks these actions were gated by
// before this feature existed. Used to seed new rows and as the fallback
// while the cache is cold. Cashier is the only managed role in this shop.
const DEFAULTS = {
  'orders.view': { cashier: true },
  'orders.create': { cashier: true },
  'orders.update': { cashier: true },
  'orders.cancel': { cashier: true },
  'orders.cancel_item': { cashier: true },
  'menu.view': { cashier: true },
  'bills.view': { cashier: true },
  'bills.request': { cashier: true },
  'bills.pay': { cashier: true },
  'bills.reprint': { cashier: true },
  'bills.revise_settlement': { cashier: true },
  'bills.void': { cashier: true },
  'bills.refund': { cashier: true },
  'bills.reopen': { cashier: true },
  'bills.discount': { cashier: true },
  'credit.writeoff': { cashier: true },
  'credit.payment_method_correct': { cashier: false },
  // Customer deletion remains off by default because it is destructive.
  'customers.delete': { cashier: false },
  'purchases.view': { cashier: true },
  'purchases.create': { cashier: true },
  'purchases.import': { cashier: true },
  'purchases.edit': { cashier: true },
  'purchases.payment_method_correct': { cashier: false },
  'purchases.void': { cashier: true },
  'suppliers.view': { cashier: true },
  'suppliers.manage': { cashier: true },
  'retail_purchasing.po.create': { cashier: false },
  'retail_purchasing.po.approve': { cashier: false },
  'retail_purchasing.grn.receive': { cashier: false },
  'retail_purchasing.grn.over_receipt': { cashier: false },
  'retail_purchasing.return.create': { cashier: false },
  'retail_purchasing.view_cost': { cashier: false },
  'retail_pos.use': { cashier: true },
  'retail_sale.view': { cashier: true },
  'retail_sale.discount': { cashier: true },
  'retail_sale.price_override': { cashier: false },
  'retail_sale.credit': { cashier: false },
  'retail_sale.view_cost': { cashier: false },
  'retail_sale.view_profit': { cashier: false },
  'retail_return.create': { cashier: true },
  'retail_return.post': { cashier: true },
  'retail_return.non_resellable': { cashier: false },
  'retail_return.without_receipt': { cashier: false },
  'retail_store_credit.adjust': { cashier: false },
  'retail_inventory.view': { cashier: true },
  'retail_inventory.view_cost': { cashier: false },
  'retail_inventory.transfer.create': { cashier: true },
  'retail_inventory.transfer.dispatch': { cashier: true },
  'retail_inventory.transfer.receive': { cashier: true },
  'retail_inventory.count.create': { cashier: true },
  'retail_inventory.count.perform': { cashier: true },
  'retail_inventory.count.approve': { cashier: false },
  'retail_inventory.adjust': { cashier: false },
  'retail_inventory.damage': { cashier: true },
  'retail_inventory.expiry': { cashier: true },
  'retail_inventory.tester': { cashier: true },
  'retail_inventory.sample': { cashier: true },
  'retail_inventory.internal_use': { cashier: true },
  'retail_inventory.quarantine_release': { cashier: false },
  'retail_inventory.print_labels': { cashier: true },
  'retail_loyalty.adjust': { cashier: false },
  'retail_online_orders.view': { cashier: true },
  'retail_online_orders.create': { cashier: true },
  'retail_online_orders.fulfill': { cashier: true },
  'retail_online_orders.verify_payment': { cashier: false },
  'retail_online_orders.manage': { cashier: true },
  'retail_analytics.view': { cashier: false },
  'payroll.view': { cashier: true },
  'payroll.advances.create': { cashier: true },
  'payroll.payments.create': { cashier: false },
  'payroll.records.delete': { cashier: false },
  'reports.view': { cashier: true },
  'report.sales.view': { cashier: true },
  'report.finance.view': { cashier: false },
  'report.expenses.view': { cashier: false },
  'report.purchases.view': { cashier: false },
  'report.suppliers.view': { cashier: false },
  'report.orders.view': { cashier: true },
  'report.changes.view': { cashier: true },
  'report.inventory.view': { cashier: true },
  'report.employees.view': { cashier: false },
  'report.menu.view': { cashier: true },
  'report.categories.view': { cashier: true },
  'report.customers.view': { cashier: false },
  'report.previous_day.view': { cashier: true },
  'dashboard.view': { cashier: true },
  'analytics.view': { cashier: false },
  'summary.view': { cashier: false },
  'menu.manage': { cashier: true },
  'promotions.manage': { cashier: false },
  'combos.manage': { cashier: false },
  'delivery.manage': { cashier: true },
  'inventory.dashboard.view': { cashier: true },
  'inventory.movements.view': { cashier: true },
  'inventory.view': { cashier: true },
  'inventory.setup.view': { cashier: true },
  'inventory.manage': { cashier: true },
  'inventory.setup.manage': { cashier: true },
  'wastage.manage': { cashier: true },
  'expenses.manage': { cashier: true },
  'expenses.payment_method_correct': { cashier: false },
  'expense_categories.manage': { cashier: false },
  'business_funding.manage': { cashier: false },
  'savings.manage': { cashier: true },
  'cash_exchange.manage': { cashier: true },
  'cash_drawer.manage': { cashier: true },
  'business_days.view': { cashier: true },
  'business_days.open': { cashier: true },
  'business_days.close': { cashier: true },
  'business_days.force_close': { cashier: false },
  'corrections.manage': { cashier: true },
  'general_ledger.view': { cashier: true },
  'hrm.departments.manage': { cashier: false },
  'hrm.designations.manage': { cashier: false },
  'hrm.attendance.manage': { cashier: false },
  'hrm.holidays.manage': { cashier: false },
  'employees.manage': { cashier: false },
  'employee_performance.view': { cashier: false },
  'cms.manage': { cashier: false },
  'settings.manage': { cashier: false },
  'inventory.import': { cashier: false },
  'pos.access': { cashier: true },
  'order_desk.access': { cashier: true },
  'customers.access': { cashier: true },
  'customer_ledger.access': { cashier: true },
  'supplier_ledger.access': { cashier: true },
  'online_orders.access': { cashier: true },
  'bills.access': { cashier: true },
  'payments.access': { cashier: true },
  'finance_dashboard.access': { cashier: true },
  'chart_of_accounts.access': { cashier: true },
  'bank_reconciliation.access': { cashier: true },
  'bank.access': { cashier: true },
  'financial_reports.access': { cashier: true },
};

export async function ensurePermissionsSchema(db) {
  if (db.driver === 'postgres') {
    const ready = await db.get(`SELECT to_regclass('public.role_permissions') AS t`);
    if (!ready?.t) throw Object.assign(new Error('Permissions schema is not installed. Run database migration 038 (npm run db:migrate).'), { status: 503, code: 'schema_missing', expose: true });
    return;
  }
  const pk = serialPkSql(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL, permission_key TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission_key))`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS permission_audit (
    ${pk}, role TEXT NOT NULL, permission_key TEXT NOT NULL, previous_value INTEGER,
    new_value INTEGER NOT NULL, actor_id INTEGER, actor_name TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await ensureColumn(db, 'role_permissions', 'updated_by', 'INTEGER');
}

function defaultFor(key, role) {
  if (ROLE_PRESETS[role]) return ROLE_PRESETS[role].has(key);
  return !!DEFAULTS[key]?.[role];
}

/* --------------------------------------------------------- sync read path */
// hasPermission() in lib/auth/auth.js must stay synchronous (it's called
// without await from a handful of unrelated routes) — so the DB-backed
// matrix is loaded into this module-level cache ahead of time (see
// ensurePermissionCache, awaited once per request in api-guard.js) and
// checked here without touching the database.

let CACHE = null;

export async function ensurePermissionCache(db) {
  // A manager can change roles while another server worker is handling
  // cashier requests. Refresh the small matrix on each guarded request so
  // stale worker memory cannot keep access hidden (or granted) incorrectly.
  await ensurePermissionsSchema(db);
  const rows = await db.all(`SELECT role, permission_key, allowed FROM role_permissions`);
  const cache = {};
  for (const role of MANAGED_ROLES) cache[role] = {};
  for (const row of rows || []) {
    if (!cache[row.role]) cache[row.role] = {};
    cache[row.role][row.permission_key] = !!row.allowed;
  }
  CACHE = cache;
  return CACHE;
}

export function invalidatePermissionCache() {
  CACHE = null;
}

export function isPermissionAllowedSync(role, key) {
  if (role === 'admin') return true;
  const cached = CACHE?.[role]?.[key];
  if (cached != null) return cached;
  return defaultFor(key, role);
}

/* ------------------------------------------------------------- admin CRUD */

export async function listRolePermissions(db) {
  await ensurePermissionsSchema(db);
  const rows = await db.all(`SELECT role, permission_key, allowed FROM role_permissions`);
  const matrix = {};
  for (const role of MANAGED_ROLES) {
    matrix[role] = {};
    for (const { key } of PERMISSION_CATALOG) matrix[role][key] = defaultFor(key, role);
  }
  for (const row of rows || []) {
    if (matrix[row.role]) matrix[row.role][row.permission_key] = !!row.allowed;
  }
  return { catalog: PERMISSION_CATALOG, roles: MANAGED_ROLES, matrix };
}

export async function setRolePermissions(db, updates, actor) {
  await ensurePermissionsSchema(db);
  const clean = (updates || []).filter((u) => {
    if (!MANAGED_ROLES.includes(u?.role) || !CATALOG_KEYS.has(u?.key)) return false;
    const allowedRoles = CATALOG_BY_KEY.get(u.key)?.roles;
    return !allowedRoles || allowedRoles.includes(u.role) || (u.role !== 'cashier' && allowedRoles.includes('cashier'));
  });
  if (!clean.length) fail('No valid permission changes supplied.');

  await db.transaction(async (tx) => {
    for (const { role, key, allowed } of clean) {
      const prev = await tx.get(`SELECT allowed FROM role_permissions WHERE role=? AND permission_key=?`, [role, key]);
      const nextValue = allowed ? 1 : 0;
      await tx.run(
        `INSERT INTO role_permissions (role, permission_key, allowed, updated_by, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (role, permission_key) DO UPDATE SET allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [role, key, nextValue, actor?.id || null]
      );
      const previousValue = prev ? (prev.allowed ? 1 : 0) : (defaultFor(key, role) ? 1 : 0);
      if (previousValue !== nextValue) {
        await tx.run(
          `INSERT INTO permission_audit (role, permission_key, previous_value, new_value, actor_id, actor_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [role, key, previousValue, nextValue, actor?.id || null, actor?.full_name || actor?.username || null]
        );
      }
    }
  });

  invalidatePermissionCache();
  return listRolePermissions(db);
}

export async function permissionAuditHistory(db, { limit = 100 } = {}) {
  await ensurePermissionsSchema(db);
  return db.all(`SELECT * FROM permission_audit ORDER BY created_at DESC, id DESC LIMIT ${Math.min(500, Math.max(1, Number(limit) || 100))}`);
}
