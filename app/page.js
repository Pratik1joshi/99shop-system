import { redirect } from 'next/navigation';

/**
 * The shop's public storefront is hosted separately; this deployment is the
 * till and back office only, so the root lands on sign-in.
 */
export default function RootPage() {
  redirect('/login');
}
