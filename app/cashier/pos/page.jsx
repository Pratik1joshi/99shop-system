import { redirect } from 'next/navigation';

export default function LegacyCashierPosRedirect() {
  redirect('/cashier/billing');
}
