import { redirect } from 'next/navigation';

/** Compatibility route for the temporary retail POS name. */
export default function LegacyRetailPosRedirect() {
  redirect('/admin/billing');
}
