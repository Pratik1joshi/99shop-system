import { redirect } from 'next/navigation';

/** Compatibility route for old bookmarks. Billing is the only checkout. */
export default function LegacyAdminPosRedirect() {
  redirect('/admin/billing');
}
