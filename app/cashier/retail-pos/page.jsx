import { redirect } from 'next/navigation';

export default function LegacyCashierRetailPosRedirect() {
  redirect('/cashier/billing');
}
