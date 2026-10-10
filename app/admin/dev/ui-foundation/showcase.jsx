'use client';

import { useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import {
  ActionDrawer, Button, ConfirmAction, DataTable, EmptyState, FormSection, InlineAlert,
  Input, Metric, Money, Quantity, ScannerInput, Skeleton, SmartFilter, StatusBadge,
  WorkspaceHeader,
} from '@/components/erp';

const rows = [
  { id: 1, sku: 'SKU-1001', product: 'Everyday clip', stock: 24, value: 2880, status: 'In stock' },
  { id: 2, sku: 'SKU-1002', product: 'Pearl hair band', stock: 3, value: 1350, status: 'Low stock' },
];

export default function Showcase() {
  const [drawer, setDrawer] = useState(false);
  const [selected, setSelected] = useState([]);
  return <AdminLayout><div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <WorkspaceHeader eyebrow="Internal development only" title="Retail UI foundation" description="Canonical tokens, controls, operational states and interaction patterns." actions={<Button onClick={() => setDrawer(true)}>Open drawer</Button>} />
    <section className="grid gap-3 md:grid-cols-3"><Metric label="Net sales" value={<Money value={128450} />} hint="Today · posted sales" /><Metric label="Low stock" value="12" hint="Actionable items" tone="warning" onClick={() => {}} /><Metric label="Inventory value" value={<Money value={890400} />} hint="Current valuation" /></section>
    <FormSection title="Controls" description="Standard density and visible validation."><div className="grid gap-4 md:grid-cols-2"><Input label="Product name" defaultValue="Everyday clip" hint="Shown on receipts and search." /><Input label="Barcode" error="This barcode is already in use." defaultValue="89010001" /><ScannerInput label="Scanner input" placeholder="Scan barcode or type SKU" onSubmit={() => {}} /><div className="flex flex-wrap items-end gap-2"><Button>Primary</Button><Button variant="outline">Secondary</Button><Button disabled disabledReason="Choose a row first">Disabled</Button></div></div></FormSection>
    <FormSection title="Status and feedback"><div className="flex flex-wrap gap-2"><StatusBadge>Draft</StatusBadge><StatusBadge tone="success">Posted</StatusBadge><StatusBadge tone="warning">Needs attention</StatusBadge><StatusBadge tone="danger">Failed</StatusBadge><SmartFilter label="Location" active onClear={() => {}}>Main store</SmartFilter></div><div className="mt-4 grid gap-3"><InlineAlert title="Information">Totals include posted transactions only.</InlineAlert><InlineAlert tone="warning" title="Review required">Three count differences need approval.</InlineAlert><InlineAlert tone="error" title="Could not post">Stock changed while this document was open.</InlineAlert></div></FormSection>
    <FormSection title="Entity table" description="Keyboard rows, numeric alignment, selection and drill-down foundation."><DataTable rows={rows} selection={selected} onSelectionChange={setSelected} columns={[{ key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'stock', label: 'Stock', numeric: true, render: (row) => <Quantity value={row.stock} /> }, { key: 'value', label: 'Value', numeric: true, render: (row) => <Money value={row.value} /> }, { key: 'status', label: 'Status', render: (row) => <StatusBadge tone={row.stock < 5 ? 'warning' : 'success'}>{row.status}</StatusBadge> }]} totals={<span>Visible inventory value: <Money value={4230} /></span>} /></FormSection>
    <section className="grid gap-4 md:grid-cols-3"><EmptyState title="No transfers awaiting receipt" description="New incoming transfers will appear here." /><div className="space-y-2 rounded-md border border-gray-200 bg-white p-4" aria-busy="true"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div><div className="rounded-md border border-gray-200 bg-white p-4"><h2 className="font-bold">Short decision</h2><p className="my-3 text-sm text-gray-600">Dialogs are reserved for confirmation and approval.</p><ConfirmAction trigger={<Button variant="destructive">Void document</Button>} title="Void this document?" description="The audit history will retain the original document." destructive confirmLabel="Void document" onConfirm={() => {}} /></div></section>
    <ActionDrawer open={drawer} onOpenChange={setDrawer} title="Bounded detail" description="Drawers keep list context for quick work." onEscalate={() => setDrawer(false)} footer={<Button onClick={() => setDrawer(false)}>Done</Button>}><p>Use a full page when the task becomes multi-step or needs substantial navigation.</p></ActionDrawer>
  </div></AdminLayout>;
}
