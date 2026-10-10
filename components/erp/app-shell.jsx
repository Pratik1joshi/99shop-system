'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity, ArrowLeftRight, ArrowRightLeft, Award, BadgePercent, BarChart3, Banknote, Bell, BellRing,
  BookOpen, Boxes, Building2, CalendarCheck2, CalendarClock, CalendarHeart, ChevronDown, ClipboardCheck, ClipboardList,
  Coins, Command, Contact, FileSearch, FileText, FolderOpen, Gauge, Globe, Inbox, Landmark, LayoutDashboard,
  Menu, MessageCircle, Package, PackageCheck, PackagePlus, PiggyBank, Plus, Receipt, ReceiptText, Scale, ScanBarcode, ScrollText,
  Search, Settings, ShieldCheck, Store, ShoppingCart, SlidersHorizontal, Tag, TrendingUp, Undo2,
  Users, Wallet, WalletCards, Wrench, X,
} from 'lucide-react';
import EntitySearch from '@/components/commerce/entity-search';
import CashCountGate from '@/components/cash-count/cash-count-gate';
import LogoutButton from '@/components/ui/logout-button';
import { useAuth } from '@/lib/auth-context';
import { useCapabilities } from '@/lib/use-capabilities';
import { apiJson } from '@/lib/authed-fetch';
import { permissionForStaffPath } from '@/lib/staff-access-policy';
import { KeyboardProvider, useShortcut } from './keyboard';

/*
 * Visual treatment follows the restaurant reference (../dimsonpuri
 * components/admin/admin-layout.jsx): white 16rem panel, 5rem icon rail,
 * tinted accordion groups with uppercase headings, coloured item icons and a
 * 4px active stripe. The destinations are Retail only. Literal Tailwind class
 * strings so the compiler keeps them.
 */
// Pastel candy tints: each group keeps its own colour for wayfinding, the
// active row lifts to white with a coloured stripe.
const NAV_TINTS = {
  amber: { bg: 'bg-amber-50', header: 'text-amber-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-amber-400', hover: 'hover:bg-white/80' },
  lime: { bg: 'bg-lime-50', header: 'text-lime-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-lime-500', hover: 'hover:bg-white/80' },
  emerald: { bg: 'bg-emerald-50', header: 'text-emerald-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-emerald-400', hover: 'hover:bg-white/80' },
  cyan: { bg: 'bg-sky-50', header: 'text-sky-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-sky-400', hover: 'hover:bg-white/80' },
  indigo: { bg: 'bg-violet-50', header: 'text-violet-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-violet-400', hover: 'hover:bg-white/80' },
  fuchsia: { bg: 'bg-fuchsia-50', header: 'text-fuchsia-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-fuchsia-400', hover: 'hover:bg-white/80' },
  rose: { bg: 'bg-pink-50', header: 'text-pink-800', activeBg: 'bg-white shadow-sm', activeBorder: 'border-pink-400', hover: 'hover:bg-white/80' },
};
const SHOP_LOGO = '/storefront/99-shop-by-shahana-logo.jpg';

// Entries without `items` render as standalone rows, as in the reference.
// `advanced` items stay out of the everyday menu until "Show all tools" is on;
// they are still reachable from Ctrl+K search and stay visible while open.
const adminNav = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, color: 'text-gray-600' },
  { name: 'Billing', href: '/admin/billing', icon: Receipt, color: 'text-emerald-700' },
  { name: 'Needs attention', href: '/admin/retail-attention', icon: BellRing, color: 'text-amber-600' },
  { name: 'Sell', tint: 'cyan', items: [
    { name: 'Sales', href: '/admin/retail-sales-history', icon: ReceiptText, color: 'text-emerald-600' },
    { name: 'Returns', href: '/admin/retail-returns', icon: Undo2, color: 'text-red-600' },
    { name: 'Online orders', href: '/admin/retail-online-orders', icon: Inbox, color: 'text-amber-600', permission: 'retail_online_orders.view' },
    { name: 'Transactions', href: '/admin/retail-transactions', icon: ArrowRightLeft, color: 'text-indigo-600', advanced: true },
  ] },
  // Products is the hub: labels, variants and the bulk editor open from there.
  { name: 'Catalog', tint: 'amber', items: [
    { name: 'Products', href: '/admin/products', icon: Package, color: 'text-blue-600' },
    { name: 'Categories & brands', href: '/admin/products/setup', icon: FolderOpen, color: 'text-purple-600' },
    { name: 'Offers & bundles', href: '/admin/retail-promotions', icon: BadgePercent, color: 'text-rose-600' },
    { name: 'Special prices', href: '/admin/products/pricing', icon: Tag, color: 'text-orange-600', advanced: true },
  ] },
  { name: 'Inventory', tint: 'lime', items: [
    { name: 'Stock', href: '/admin/retail-inventory', icon: Boxes, color: 'text-indigo-600' },
    { name: 'Movements', href: '/admin/retail-inventory-movements', icon: ClipboardList, color: 'text-indigo-700', advanced: true },
    { name: 'Counts', href: '/admin/retail-stock-counts', icon: ClipboardCheck, color: 'text-cyan-700' },
    { name: 'Transfers', href: '/admin/retail-transfers', icon: ArrowLeftRight, color: 'text-teal-600', advanced: true },
    { name: 'Tracking', href: '/admin/retail-inventory-tracking', icon: ScanBarcode, color: 'text-sky-600', advanced: true },
    { name: 'Adjustments', href: '/admin/retail-inventory-ops', icon: SlidersHorizontal, color: 'text-amber-700', advanced: true },
    { name: 'Replenishment', href: '/admin/retail-replenishment', icon: PackagePlus, color: 'text-emerald-600', advanced: true },
    { name: 'Stock reports', href: '/admin/retail-inventory-reports', icon: Gauge, color: 'text-indigo-700' },
  ] },
  { name: 'Purchasing', tint: 'emerald', items: [
    { name: 'Suppliers', href: '/admin/retail-suppliers', icon: Building2, color: 'text-slate-600' },
    { name: 'Purchase orders', href: '/admin/retail-purchase-orders', icon: ShoppingCart, color: 'text-amber-700', advanced: true },
    { name: 'Purchases', href: '/admin/retail-goods-receipts', icon: PackageCheck, color: 'text-teal-600' },
    { name: 'Purchase returns', href: '/admin/retail-purchase-returns', icon: Undo2, color: 'text-red-600', advanced: true },
    { name: 'Payables', href: '/admin/accounts-payable', icon: Receipt, color: 'text-orange-700', advanced: true },
  ] },
  { name: 'Customers', tint: 'rose', items: [
    { name: 'Customers', href: '/admin/retail-customers', icon: Users, color: 'text-pink-600' },
    { name: 'Receivables', href: '/admin/retail-receivables', icon: Receipt, color: 'text-teal-700' },
    { name: 'Payment reminders', href: '/admin/retail-reminders', icon: MessageCircle, color: 'text-green-600', advanced: true },
    { name: 'Loyalty rules', href: '/admin/retail-loyalty', icon: Award, color: 'text-violet-600', advanced: true },
    { name: 'After-sales', href: '/admin/retail-after-sales', icon: Wrench, color: 'text-slate-600', advanced: true },
  ] },
  { name: 'Finance', tint: 'indigo', items: [
    { name: 'Finance overview', href: '/admin/retail-finance', icon: Gauge, color: 'text-gray-900', advanced: true },
    { name: 'Registers & cash', href: '/admin/retail-registers', icon: CalendarClock, color: 'text-emerald-700' },
    { name: 'Cash variance review', href: '/admin/retail-cash-variances', icon: Banknote, color: 'text-amber-700', roles: ['admin', 'manager'], advanced: true },
    { name: 'Expenses', href: '/admin/expenses', icon: Wallet, color: 'text-emerald-600' },
    { name: 'Expense categories', href: '/admin/expense-categories', icon: FolderOpen, color: 'text-emerald-700', advanced: true },
    { name: 'Business funding', href: '/admin/business-funding', icon: PiggyBank, color: 'text-violet-700', advanced: true },
    { name: 'Savings & deposits', href: '/admin/savings', icon: PiggyBank, color: 'text-sky-700', advanced: true },
    { name: 'Cash exchange', href: '/admin/cash-exchange', icon: ArrowRightLeft, color: 'text-amber-600', advanced: true },
  ] },
  { name: 'Accounting', tint: 'emerald', items: [
    { name: 'Chart of accounts', href: '/admin/chart-of-accounts', icon: BookOpen, color: 'text-indigo-600', advanced: true },
    { name: 'General ledger', href: '/admin/general-ledger', icon: ScrollText, color: 'text-slate-600', advanced: true },
    { name: 'Cash book', href: '/admin/cash-book', icon: Coins, color: 'text-yellow-600', advanced: true },
    { name: 'Bank book', href: '/admin/bank-book', icon: Landmark, color: 'text-blue-600', advanced: true },
    { name: 'Banking', href: '/admin/bank', icon: Landmark, color: 'text-teal-600', advanced: true },
    { name: 'Bank reconciliation', href: '/admin/bank-reconciliation', icon: ClipboardCheck, color: 'text-cyan-700', advanced: true },
    { name: 'Statements', href: '/admin/financial-reports', icon: FileText, color: 'text-indigo-700', advanced: true },
    { name: 'Retail reconciliation', href: '/admin/retail-reconciliation', icon: Scale, color: 'text-emerald-700', advanced: true },
  ] },
  { name: 'Insights', tint: 'indigo', items: [
    { name: 'Reports', href: '/admin/reports', icon: BarChart3, color: 'text-indigo-600' },
    { name: 'Retail analytics', href: '/admin/retail-analytics', icon: TrendingUp, color: 'text-emerald-700', advanced: true },
    { name: 'Operations intelligence', href: '/admin/retail-operations', icon: Activity, color: 'text-orange-600', advanced: true },
    { name: 'Daily summary', href: '/admin/summary-report', icon: ScrollText, color: 'text-rose-700' },
  ] },
  { name: 'People', tint: 'fuchsia', items: [
    { name: 'Staff', href: '/admin/employees', icon: Users, color: 'text-green-600' },
    { name: 'Departments', href: '/admin/hrm/departments', icon: Building2, color: 'text-pink-600', advanced: true },
    { name: 'Designations', href: '/admin/hrm/designations', icon: Contact, color: 'text-pink-600', advanced: true },
    { name: 'Attendance', href: '/admin/hrm/attendance', icon: CalendarCheck2, color: 'text-sky-600', advanced: true },
    { name: 'Holidays', href: '/admin/hrm/holidays', icon: CalendarHeart, color: 'text-rose-600', advanced: true },
    { name: 'Payroll', href: '/admin/payroll', icon: WalletCards, color: 'text-emerald-700' },
    { name: 'Staff performance', href: '/admin/employee-performance', icon: TrendingUp, color: 'text-lime-600', advanced: true },
  ] },
  { name: 'Website', href: '/admin/website', icon: Globe, color: 'text-sky-600' },
  { name: 'Online store', href: '/admin/products/storefront', icon: Store, color: 'text-teal-600', advanced: true },
  { name: 'Audit', href: '/admin/retail-audit', icon: FileSearch, color: 'text-slate-600', advanced: true },
  { name: 'Staff permissions', href: '/admin/permissions', icon: ShieldCheck, color: 'text-red-600', advanced: true },
  { name: 'Settings', href: '/admin/settings', icon: Settings, color: 'text-gray-600' },
];

// Cashier entries mirror lib/staff-access-policy.js keys, so a link is shown
// exactly when the page itself would open. The everyday cashier menu is five
// items; anything else the role may open sits behind "Show all tools".
const cashierNav = [
  { name: 'Dashboard', href: '/cashier/dashboard', icon: LayoutDashboard, color: 'text-gray-600', permission: 'dashboard.view', advanced: true },
  { name: 'Billing', href: '/cashier/billing', icon: Receipt, color: 'text-emerald-700', permission: 'retail_pos.use' },
  { name: 'Sell', tint: 'cyan', items: [
    { name: 'Sales', href: '/cashier/retail-sales-history', icon: ReceiptText, color: 'text-emerald-600', permission: 'retail_sale.view' },
    { name: 'Online orders', href: '/cashier/retail-online-orders', icon: Inbox, color: 'text-amber-600', permission: 'retail_online_orders.view', advanced: true },
    { name: 'Transactions', href: '/cashier/retail-transactions', icon: ArrowRightLeft, color: 'text-indigo-600', permission: 'retail_sale.view', advanced: true },
  ] },
  { name: 'Catalog', tint: 'amber', items: [
    { name: 'Products', href: '/cashier/products', icon: Package, color: 'text-blue-600', permission: 'menu.view', advanced: true },
    { name: 'Categories & brands', href: '/cashier/categories', icon: FolderOpen, color: 'text-purple-600', permission: 'menu.manage', advanced: true },
  ] },
  { name: 'Inventory', tint: 'lime', items: [
    { name: 'Stock lookup', href: '/cashier/retail-stock', icon: Boxes, color: 'text-indigo-600', permission: 'menu.view' },
  ] },
  { name: 'Purchasing', tint: 'emerald', items: [
    { name: 'Goods receipts', href: '/cashier/purchases', icon: PackageCheck, color: 'text-teal-600', permission: 'purchases.view', advanced: true },
  ] },
  { name: 'Customers', href: '/cashier/customers', icon: Users, color: 'text-pink-600', permission: 'customers.access' },
  { name: 'Finance', tint: 'indigo', items: [
    { name: 'Registers & cash', href: '/cashier/retail-registers', icon: CalendarClock, color: 'text-emerald-700', permission: 'business_days.view' },
    { name: 'Expenses', href: '/cashier/expenses', icon: Wallet, color: 'text-emerald-600', permission: 'expenses.manage', advanced: true },
    { name: 'Expense categories', href: '/cashier/expense-categories', icon: FolderOpen, color: 'text-emerald-700', permission: 'expense_categories.manage', advanced: true },
    { name: 'Business funding', href: '/cashier/business-funding', icon: PiggyBank, color: 'text-violet-700', permission: 'business_funding.manage', advanced: true },
    { name: 'Savings & deposits', href: '/cashier/savings', icon: PiggyBank, color: 'text-sky-700', permission: 'savings.manage', advanced: true },
    { name: 'Cash exchange', href: '/cashier/cash-exchange', icon: ArrowRightLeft, color: 'text-amber-600', permission: 'cash_exchange.manage', advanced: true },
  ] },
  { name: 'Accounting', tint: 'emerald', items: [
    { name: 'Cash book', href: '/cashier/cash-book', icon: Coins, color: 'text-yellow-600', permission: 'general_ledger.view', advanced: true },
    { name: 'Bank book', href: '/cashier/bank-book', icon: Landmark, color: 'text-blue-600', permission: 'general_ledger.view', advanced: true },
  ] },
  { name: 'Reports', href: '/cashier/reports', icon: BarChart3, color: 'text-indigo-600', permission: 'reports.view', advanced: true },
  { name: 'Website', href: '/cashier/website', icon: Globe, color: 'text-sky-600', permission: 'cms.manage', advanced: true },
  { name: 'People', tint: 'fuchsia', items: [
    { name: 'Staff', href: '/cashier/employees', icon: Users, color: 'text-green-600', permission: 'employees.manage', advanced: true },
    { name: 'Departments', href: '/cashier/hrm/departments', icon: Building2, color: 'text-pink-600', permission: 'hrm.departments.manage', advanced: true },
    { name: 'Designations', href: '/cashier/hrm/designations', icon: Contact, color: 'text-pink-600', permission: 'hrm.designations.manage', advanced: true },
    { name: 'Attendance', href: '/cashier/hrm/attendance', icon: CalendarCheck2, color: 'text-sky-600', permission: 'hrm.attendance.manage', advanced: true },
    { name: 'Holidays', href: '/cashier/hrm/holidays', icon: CalendarHeart, color: 'text-rose-600', permission: 'hrm.holidays.manage', advanced: true },
    { name: 'Payroll', href: '/cashier/payroll', icon: WalletCards, color: 'text-emerald-700', permission: 'payroll.view', advanced: true },
    { name: 'Staff performance', href: '/cashier/employee-performance', icon: TrendingUp, color: 'text-lime-600', permission: 'employee_performance.view', advanced: true },
  ] },
];

const specialistPagePermissions = {
  '/admin/retail-transactions': ['retail_sale.view','retail_inventory.view','retail_purchasing.po.create','general_ledger.view'],
  '/admin/dashboard': 'dashboard.view',
  '/admin/retail-attention': 'dashboard.view',
  '/admin/billing': 'retail_pos.use',
  '/admin/retail-sales-history': 'retail_sale.view',
  '/admin/retail-online-orders':'retail_online_orders.view',
  '/admin/retail-returns': 'retail_return.create',
  '/admin/retail-inventory': 'retail_inventory.view',
  '/admin/retail-inventory-movements': 'retail_inventory.view',
  '/admin/retail-inventory-tracking': 'retail_inventory.view',
  '/admin/retail-stock-counts': 'retail_inventory.view',
  '/admin/retail-transfers': 'retail_inventory.view',
  '/admin/retail-inventory-ops': 'retail_inventory.adjust',
  '/admin/retail-replenishment': 'retail_purchasing.po.create',
  '/admin/retail-purchase-orders': 'retail_purchasing.po.create',
  '/admin/retail-goods-receipts': 'retail_purchasing.grn.receive',
  '/admin/retail-purchase-returns': 'retail_purchasing.return.create',
  '/admin/retail-suppliers': 'retail_purchasing.view_cost',
  '/admin/customers': 'customers.access',
  '/admin/retail-customers': 'customers.access',
  '/admin/retail-after-sales': 'warranty.view',
  '/admin/retail-operations': 'operations.view',
  '/admin/retail-receivables': 'customer_ledger.access',
  '/admin/retail-reminders': 'customer_ledger.access',
  '/admin/accounts-receivable': 'customer_ledger.access',
  '/admin/accounts-payable': 'supplier_ledger.access',
  '/admin/business-days': 'business_days.view',
  '/admin/retail-registers': 'business_days.view',
  '/admin/retail-cash-variances': 'business_days.view',
  '/admin/retail-finance': 'finance_dashboard.access',
  '/admin/cash-drawer': 'cash_drawer.manage',
  '/admin/expenses': 'expenses.manage',
  '/admin/bank': 'bank.access',
  '/admin/bank-reconciliation': 'bank_reconciliation.access',
  '/admin/chart-of-accounts': 'chart_of_accounts.access',
  '/admin/general-ledger': 'general_ledger.view',
  '/admin/cash-book': 'general_ledger.view',
  '/admin/bank-book': 'general_ledger.view',
  '/admin/retail-journals': 'general_ledger.view',
  '/admin/financial-reports': 'financial_reports.access',
  '/admin/retail-reconciliation': 'general_ledger.view',
  '/admin/retail-analytics': 'retail_analytics.view',
};
const hasPagePermission = (can, permission) => !!permission && (Array.isArray(permission) ? permission.some(can) : can(permission));
const specialistPermissionForPath = (path) => Object.entries(specialistPagePermissions)
  .sort((a, b) => b[0].length - a[0].length)
  .find(([prefix]) => path === prefix || path?.startsWith(`${prefix}/`))?.[1];

// Header title for routes reached from inside a page rather than the sidebar.
const aliases = [
  ['/admin/pos', 'Billing'], ['/admin/orders', 'Sell'], ['/admin/bills', 'Sell'],
  ['/admin/inventory', 'Inventory'], ['/admin/wastage', 'Inventory'], ['/admin/cash-', 'Finance'],
  ['/admin/finance-dashboard', 'Finance'], ['/admin/retail-journals', 'Accounting'],
  ['/admin/analytics', 'Insights'], ['/cashier/pos', 'Billing'], ['/cashier/inventory', 'Inventory'],
];

const pathOf = (href) => href.split('?')[0];
const matches = (pathname, href) => pathname === pathOf(href) || pathname?.startsWith(`${pathOf(href)}/`);

function ShellContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { role, capabilities, loading: capabilityLoading, can } = useCapabilities();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [savedExpanded, setSavedExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Billing opens on the icon rail, like the restaurant POS, without touching
  // the saved preference; expanding it there lasts until the page changes.
  const [wideChoice, setWideChoice] = useState(null);
  const wideRoute = /^\/(admin|cashier)\/billing(\/|$)/.test(pathname || '');
  const sidebarExpanded = wideRoute ? wideChoice?.path === pathname && wideChoice.expanded : savedExpanded;
  // Accordion: the user's choice holds on the page where it was made; any
  // other page opens the group that contains it.
  const [groupChoice, setGroupChoice] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [day, setDay] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const desktopNavRef = useRef(null);
  const isCashier = pathname?.startsWith('/cashier');
  const isSpecialist = ['inventory_staff', 'purchasing_staff', 'accountant', 'manager'].includes(user?.role);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const expanded = localStorage.getItem('shop99_sidebar_expanded');
        if (expanded != null) setSavedExpanded(expanded === 'true');
        setShowAdvanced(localStorage.getItem('shop99_nav_advanced') === 'true');
        const choice = JSON.parse(localStorage.getItem('shop99_sidebar_group') || 'null');
        if (choice && typeof choice === 'object') setGroupChoice(choice);
        if (desktopNavRef.current) desktopNavRef.current.scrollTop = Number(sessionStorage.getItem('shop99_sidebar_scroll') || 0);
      } catch { /* Storage is optional; navigation remains usable. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleSidebar = () => {
    if (wideRoute) return setWideChoice({ path: pathname, expanded: !sidebarExpanded });
    setSavedExpanded((current) => {
      const next = !current;
      try { localStorage.setItem('shop99_sidebar_expanded', String(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (authLoading) return;
    const allowed = user && (isCashier ? ['admin', 'cashier'].includes(user.role) : user.role === 'admin' || ['inventory_staff', 'purchasing_staff', 'accountant', 'manager'].includes(user.role));
    if (!allowed && (user || !localStorage.getItem('pos_token'))) router.replace('/login');
  }, [authLoading, isCashier, router, user]);

  const refreshDay = useCallback(() => {
    apiJson('/api/admin/business-days?view=context')
      .then((value) => { setDay(value); setStatusError(false); })
      .catch(() => setStatusError(true));
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    refreshDay();
    window.addEventListener('focus', refreshDay);
    return () => window.removeEventListener('focus', refreshDay);
  }, [pathname, refreshDay, user]);

  const navEntries = useMemo(() => {
    const allowed = (item) => (!item.roles || item.roles.includes(role)) && (isSpecialist
      ? !!specialistPagePermissions[item.href] && hasPagePermission(can, specialistPagePermissions[item.href])
      : !item.permission || can(item.permission));
    return (isCashier ? cashierNav : adminNav).map((entry) => {
      if (!entry.items) return allowed(entry) ? entry : null;
      const items = entry.items.filter(allowed);
      return items.length ? { ...entry, items } : null;
    }).filter(Boolean);
  }, [can, isCashier, isSpecialist, role]);

  const allItems = useMemo(() => navEntries.flatMap((entry) => entry.items || [entry]), [navEntries]);
  // Longest match, so /admin/products does not light up on /admin/products/pricing.
  const activeHref = useMemo(() => allItems.map((item) => item.href).filter((href) => matches(pathname, href))
    .sort((a, b) => b.length - a.length)[0] || null, [allItems, pathname]);
  // Specialist roles already see only their own permitted pages, so the simple menu is for owner and cashier.
  const simpleMenu = !showAdvanced && ['admin', 'cashier'].includes(role);
  const visibleEntries = useMemo(() => {
    const keep = (item) => !simpleMenu || !item.advanced || item.href === activeHref;
    return navEntries.map((entry) => {
      if (!entry.items) return keep(entry) ? entry : null;
      const items = entry.items.filter(keep);
      return items.length ? { ...entry, items } : null;
    }).filter(Boolean);
  }, [activeHref, navEntries, simpleMenu]);
  const flatItems = useMemo(() => visibleEntries.flatMap((entry) => entry.items || [entry]), [visibleEntries]);
  const hiddenCount = allItems.length - flatItems.length;
  const toggleAdvanced = () => setShowAdvanced((current) => {
    try { localStorage.setItem('shop99_nav_advanced', String(!current)); } catch {}
    return !current;
  });
  const activeEntry = navEntries.find((entry) => entry.items ? entry.items.some((item) => item.href === activeHref) : entry.href === activeHref);
  const activeItem = allItems.find((item) => item.href === activeHref);
  const aliasName = aliases.find(([prefix]) => pathname?.startsWith(prefix))?.[1];
  const openGroup = groupChoice?.path === pathname ? groupChoice.group : activeEntry?.items ? activeEntry.name : null;
  const toggleGroup = (name) => {
    const next = { group: openGroup === name ? null : name, path: pathname };
    setGroupChoice(next);
    try { localStorage.setItem('shop99_sidebar_group', JSON.stringify(next)); } catch {}
  };

  const pagePermission = isCashier ? permissionForStaffPath(pathname) : null;
  const specialistPermission = isSpecialist ? specialistPermissionForPath(pathname) : null;
  const denied = (role === 'cashier' && pagePermission && !capabilities[pagePermission]) ||
    (isSpecialist && (!specialistPermission || !hasPagePermission(can,specialistPermission)));

  const openCommand = useCallback(() => setCommandOpen(true), []);
  useShortcut('mod+k', openCommand, { allowInField: true });

  // The New menu is a <details>; it closes on a click outside it, on Esc, and after a pick.
  const newMenuRef = useRef(null);
  const closeNewMenu = () => { if (newMenuRef.current) newMenuRef.current.open = false; };
  useEffect(() => {
    const outside = (event) => { if (newMenuRef.current?.open && !newMenuRef.current.contains(event.target)) closeNewMenu(); };
    const escape = (event) => { if (event.key === 'Escape') closeNewMenu(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  if (authLoading || capabilityLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50" role="status">
      <div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-4 border-gray-900" /><p className="text-gray-600">Loading workspace…</p></div>
    </div>;
  }
  if (denied) {
    return <main className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-gray-400" />
        <h1 className="mt-4 text-xl font-bold text-gray-950">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">Your role does not have permission to open this area. Ask an administrator to enable it under Staff permissions.</p>
        <Link href={flatItems[0]?.href || (isCashier ? '/cashier/dashboard' : '/admin/dashboard')} className="mt-6 inline-block rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">Return to your workspace</Link>
      </div>
    </main>;
  }

  const quickCreates = [
    { label: 'Create sale', href: isCashier ? '/cashier/billing' : '/admin/billing', permission: 'retail_pos.use' },
    ...(!isCashier ? [{ label: 'Add product', href: '/admin/products' }, { label: 'Add customer', href: '/admin/customers' }, { label: 'Receive stock', href: '/admin/retail-goods-receipts' }, { label: 'Record expense', href: '/admin/expenses' }] : []),
  ].filter((item) => isSpecialist ? !!specialistPagePermissions[item.href] && hasPagePermission(can,specialistPagePermissions[item.href])
    : role === 'admin' || !item.permission || can(item.permission));
  const panelTitle = isCashier ? 'Cashier Station' : user.role === 'admin' ? 'Admin Panel' : 'Staff Workspace';

  const renderNavigation = (mobile = false) => {
    const showLabels = mobile || sidebarExpanded;
    const renderItem = (item, topLevel, tint) => {
      const isActive = item.href === activeHref;
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
        aria-label={showLabels ? undefined : item.name} title={showLabels ? undefined : item.name} aria-current={isActive ? 'page' : undefined}
        className={`relative flex w-full items-center rounded-xl py-2.5 text-left transition-colors ${showLabels ? `gap-3 ${topLevel ? 'px-4' : 'pl-7 pr-4'}` : 'justify-center px-2'} ${
          isActive ? `${tint?.activeBg || 'bg-pink-50'} border-l-4 ${tint?.activeBorder || 'border-pink-500'}` : `active:bg-pink-50 ${tint?.hover || 'hover:bg-pink-50/70'}`}`}>
        <Icon aria-hidden className={`${item.color} ${showLabels ? 'h-5 w-5' : 'h-6 w-6'} shrink-0`} />
        {showLabels && <span className={`flex-1 ${isActive ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{item.name}</span>}
      </Link>;
    };
    return <>
      <div className="erp-gingham" aria-hidden />
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4">
        {showLabels && <div className="erp-brand"><img src={SHOP_LOGO} alt="" /><div className="min-w-0"><strong>99 Shop</strong><small>{panelTitle}</small></div></div>}
        {mobile
          ? <Dialog.Close className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 active:bg-gray-200" aria-label="Close navigation"><X size={22} aria-hidden /></Dialog.Close>
          : <button type="button" onClick={toggleSidebar} aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={sidebarExpanded}
              className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100">
              {sidebarExpanded ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>}
      </div>
      <nav ref={mobile ? undefined : desktopNavRef} aria-label="Retail workspaces" className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
        onScroll={mobile ? undefined : (event) => { try { sessionStorage.setItem('shop99_sidebar_scroll', String(event.currentTarget.scrollTop)); } catch {} }}>
        {showLabels ? visibleEntries.map((entry) => {
          if (!entry.items) return renderItem(entry, true);
          const expanded = openGroup === entry.name;
          const tint = NAV_TINTS[entry.tint];
          const groupId = `${mobile ? 'mobile' : 'desktop'}-nav-${entry.name.toLowerCase()}`;
          return <div key={entry.name} className={`rounded-xl ${tint.bg}`}>
            <button type="button" onClick={() => toggleGroup(entry.name)} aria-expanded={expanded} aria-controls={groupId}
              className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide ${tint.header} ${tint.hover}`}>
              <span className="flex-1">{entry.name}</span>
              <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <div id={groupId} className="mt-1 space-y-1 pb-1">{entry.items.map((item) => renderItem(item, false, tint))}</div>}
          </div>;
        }) : flatItems.map((item) => renderItem(item, true))}
      </nav>
      <div className="shrink-0 border-t border-gray-200 p-3">
        {showLabels && ['admin', 'cashier'].includes(role) && (hiddenCount > 0 || showAdvanced) && <button type="button" role="switch" aria-checked={showAdvanced} onClick={toggleAdvanced}
          className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-semibold text-gray-600 hover:bg-pink-50">
          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showAdvanced ? 'bg-pink-500' : 'bg-gray-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${showAdvanced ? 'left-[1.125rem]' : 'left-0.5'}`} /></span>
          <span className="min-w-0 flex-1">{showAdvanced ? 'Showing all tools' : `Show all tools (${hiddenCount} more)`}</span>
        </button>}
        {showLabels && <p className="truncate px-4 pb-1 text-xs text-gray-500"><span className="font-semibold text-gray-700">{user.full_name || user.username}</span> · <span className="capitalize">{String(user.role).replace('_', ' ')}</span></p>}
        <LogoutButton onLogout={logout} variant="sidebar" label="Logout" iconOnly={!showLabels} className={showLabels ? '' : 'justify-center space-x-0 px-2'} />
      </div>
    </>;
  };

  return <div className={`erp-app${sidebarExpanded ? '' : ' erp-app--rail'}`}>
    {/* React hoists these into <head>; staff-only, so the storefront never pays for Nunito. */}
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@400;500;600;700;800&display=swap" precedence="default" />
    <a className="erp-skip-link" href="#erp-main">Skip to content</a>
    <aside className="erp-sidebar">{renderNavigation()}</aside>
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><Dialog.Portal><Dialog.Overlay className="erp-overlay" /><Dialog.Content className="erp-mobile-nav"><Dialog.Title className="sr-only">Navigation</Dialog.Title><Dialog.Description className="sr-only">Open a permitted retail workspace or view.</Dialog.Description>{renderNavigation(true)}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <div className="erp-stage">
      <header className="erp-global-header">
        <button className="erp-icon-button erp-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></button>
        <div className="erp-title"><strong>{activeEntry?.name || aliasName || 'Retail'}</strong>{activeEntry?.items && activeItem && <><span aria-hidden>/</span><small>{activeItem.name}</small></>}</div>
        <button type="button" className="erp-command-trigger" onClick={openCommand}><Search /><span>Search or run a command</span><kbd>Ctrl K</kbd></button>
        {(() => {
          const label = statusError ? 'Status unavailable' : day?.activeSession ? 'Register open' : 'Register closed';
          const content = <><span aria-hidden /><div><strong>{label}</strong>{day?.current && <small>{day.current.business_date}{day.activeSession ? ` · Session ${day.activeSession.session_number}` : ''}</small>}</div></>;
          const className = `erp-day-status ${day?.activeSession ? 'is-open' : 'is-closed'}`;
          // Opens Registers & cash, where the register is opened and closed.
          return role === 'admin' || can('business_days.view')
            ? <Link href={`${isCashier ? '/cashier' : '/admin'}/retail-registers`} className={className} aria-label={`${label}. Open or close the register`} title={statusError ? 'Status could not be refreshed' : 'Open or close the register'}>{content}</Link>
            : <div role="status" aria-label={label} className={className}>{content}</div>;
        })()}
        {!isCashier && <Link className="erp-icon-button" href="/admin/retail-attention" aria-label="Attention center" title="Attention center"><Bell /></Link>}
        <details ref={newMenuRef} className="erp-menu"><summary><Plus /> <span>New</span><ChevronDown /></summary><div>{quickCreates.map((item) => <Link key={item.label} href={item.href} onClick={closeNewMenu}>{item.label}</Link>)}</div></details>
      </header>
      <main id="erp-main" className="erp-main" tabIndex={-1}><CashCountGate active={isCashier && role === 'cashier'}>{children}</CashCountGate></main>
    </div>
    <CommandSurface open={commandOpen} onOpenChange={setCommandOpen} navEntries={navEntries} quickCreates={quickCreates} />
  </div>;
}

function CommandSurface({ open, onOpenChange, navEntries, quickCreates }) {
  const [query, setQuery] = useState('');
  const commands = [...quickCreates.map((item) => ({ ...item, group: 'Create' })),
    ...navEntries.flatMap((entry) => (entry.items || [entry]).map((item) => ({ ...item, group: entry.items ? entry.name : 'Go to' })))];
  const filtered = commands.filter((item) => `${item.group} ${item.label || item.name}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="erp-overlay" /><Dialog.Content className="erp-command"><Dialog.Title>Search and commands</Dialog.Title><Dialog.Description>Navigate implemented workspaces and start common tasks.</Dialog.Description><div className="erp-command-input"><Command /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command or workspace…" aria-label="Search commerce and commands" /></div><div className="erp-command-results"><EntitySearch query={query} open={open} onSelect={() => onOpenChange(false)} />{filtered.length ? filtered.map((item) => <Link key={`${item.group}-${item.href}-${item.label || item.name}`} href={item.href} onClick={() => onOpenChange(false)}><span>{item.label || item.name}</span><small>{item.group}</small></Link>) : <p>No matching implemented command.</p>}</div><Dialog.Close className="erp-command-close" aria-label="Close"><X /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export default function AppShell({ children }) {
  return <KeyboardProvider><ShellContent>{children}</ShellContent></KeyboardProvider>;
}
