import AdminLayout from '@/components/admin/admin-layout';

// Staff screens never belong in search results.
export const metadata = { title: 'Staff', robots: { index: false, follow: false } };

export default function CashierRouteLayout({ children }) {
  return <AdminLayout>{children}</AdminLayout>;
}
