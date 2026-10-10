'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import BusinessDaysPage from '@/app/admin/business-days/page';
import CashDrawerPage from '@/app/admin/cash-drawer/page';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

export default function RetailRegistersPage() {
  const { can } = useCapabilities();
  const [tab, setTab] = useState('day');
  const [day, setDay] = useState(null);
  const [drawer, setDrawer] = useState(null);
  useEffect(() => {
    apiJson('/api/admin/business-days?view=context').then(setDay).catch(() => {});
    apiJson('/api/admin/cash-drawer').then(setDrawer).catch(() => {});
  }, []);
  const drawerAllowed = can('cash_drawer.manage');
  return <AdminLayout><div className="retail-money-page">
    <header className="retail-money-heading"><div><p className="retail-eyebrow">FINANCE / OPERATIONS</p><h1>Registers &amp; Cash</h1><p>The business day is the reporting period. A register session tracks custody of physical cash.</p></div></header>
    <div className="retail-money-metrics">
      <div><small>Business day</small><strong>{day?.current?.business_date || 'No open day'}</strong><span>{day?.activeSession ? 'Store session open' : 'Store session closed'}{day?.isStale ? ' · Previous Nepal date' : ''}</span></div>
      <div><small>Register session</small><strong>{drawerAllowed ? drawer?.open?.drawer_name || 'Closed' : 'Restricted'}</strong><span>{drawerAllowed ? drawer?.open ? 'Cash drawer open' : 'No active cash drawer' : 'Your role cannot operate the cash drawer'}</span></div>
    </div>
    <nav className="retail-money-toolbar" aria-label="Registers and cash views">
      <button type="button" aria-current={tab === 'day' ? 'page' : undefined} onClick={() => setTab('day')}>Business day &amp; closing</button>
      {drawerAllowed && <button type="button" aria-current={tab === 'cash' ? 'page' : undefined} onClick={() => setTab('cash')}>Register &amp; cash movements</button>}
    </nav>
  </div>
    {tab === 'cash' && drawerAllowed ? <CashDrawerPage embedded /> : <BusinessDaysPage embedded />}
  </AdminLayout>;
}
