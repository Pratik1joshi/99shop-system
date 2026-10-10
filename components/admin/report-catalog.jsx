import {
  ClipboardCheck, Contact, DollarSign, Layers, Package,
  ReceiptText, ShoppingCart, Truck, Undo2, Users, Wallet, Warehouse,
} from 'lucide-react';

export const REPORT_CATALOG = [
  { id: 'sales', label: 'Sales Report', shortLabel: 'Sales', blurb: 'Completed retail sales and period totals net of posted returns.', icon: DollarSign, chip: 'bg-emerald-50 text-emerald-600', accent: 'border-t-emerald-400' },
  { id: 'finance', label: 'Sales & Tax Snapshot', shortLabel: 'Sales & tax', blurb: 'The retail sales totals and VAT view; full accounting statements are in Finance.', icon: Wallet, chip: 'bg-indigo-50 text-indigo-600', accent: 'border-t-indigo-400' },
  { id: 'expenses', label: 'Expenses Report', shortLabel: 'Expenses', blurb: 'Active manual operating expenses by expense date; linked stock costs are excluded.', icon: ReceiptText, chip: 'bg-rose-50 text-rose-600', accent: 'border-t-rose-400' },
  { id: 'purchases', label: 'Receipts Report', shortLabel: 'Receipts', blurb: 'Posted goods receipts by supplier and invoice reference.', icon: ShoppingCart, chip: 'bg-amber-50 text-amber-600', accent: 'border-t-amber-400' },
  { id: 'suppliers', label: 'Supplier Receipts Report', shortLabel: 'Suppliers', blurb: 'Posted receipt totals grouped by supplier.', icon: Truck, chip: 'bg-slate-100 text-slate-600', accent: 'border-t-slate-400' },
  { id: 'orders', label: 'Completed Sales Report', shortLabel: 'Completed sales', blurb: 'Completed retail sales only; held and cancelled sales are outside this view.', icon: ClipboardCheck, chip: 'bg-cyan-50 text-cyan-600', accent: 'border-t-cyan-400' },
  { id: 'changes', label: 'Returns by Reason', shortLabel: 'Returns', blurb: 'Posted retail return value and line count grouped by reason.', icon: Undo2, chip: 'bg-red-50 text-red-600', accent: 'border-t-red-400' },
  { id: 'inventory', label: 'Current Stock Report', shortLabel: 'Current stock', blurb: 'Current inventory balance and valuation; period selection does not change this snapshot.', icon: Warehouse, chip: 'bg-lime-50 text-lime-700', accent: 'border-t-lime-400' },
  { id: 'employees', label: 'Cashier Sales Report', shortLabel: 'Cashiers', blurb: 'Retail sales attributed to cashier; attendance and payroll are separate.', icon: Users, chip: 'bg-fuchsia-50 text-fuchsia-600', accent: 'border-t-fuchsia-400' },
  { id: 'products', label: 'Product Sales Report', shortLabel: 'Products', blurb: 'Retail sales, historical cost and margin by product.', icon: Package, chip: 'bg-orange-50 text-orange-600', accent: 'border-t-orange-400' },
  { id: 'categories', label: 'Category Sales Report', shortLabel: 'Categories', blurb: 'Retail sales, historical cost and margin by category.', icon: Layers, chip: 'bg-teal-50 text-teal-600', accent: 'border-t-teal-400' },
  { id: 'customers', label: 'Customer Sales Report', shortLabel: 'Customers', blurb: 'Customer sales and average spend within the selected period.', icon: Contact, chip: 'bg-pink-50 text-pink-600', accent: 'border-t-pink-400' },
];

export const REPORT_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom dates' },
];

export const reportMeta = (id) => REPORT_CATALOG.find((report) => report.id === id) || REPORT_CATALOG[0];
