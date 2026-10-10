import { redirect } from 'next/navigation';

/** Old 99 Shop inventory purchases now resolve to retail stock receiving. */
export default function PurchasesRedirect() {
  redirect('/admin/retail-goods-receipts');
}
