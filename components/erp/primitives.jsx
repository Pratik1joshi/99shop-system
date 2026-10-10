'use client';

import { createContext, useContext, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Inbox, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';

export function WorkspaceHeader({ eyebrow, title, description, actions, children }) {
  return <header className="erp-workspace-header"><div className="min-w-0"><p className="erp-eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="erp-header-actions">{actions}</div>}{children}</header>;
}
export function StatusBadge({ tone = 'neutral', children }) { return <span className={`erp-status erp-status--${tone}`}>{children}</span>; }
export function Money({ value, className }) { return <span className={cn('erp-number', className)}>{formatCurrency(Number(value || 0))}</span>; }
export function Quantity({ value, unit, className }) { return <span className={cn('erp-number', className)}>{Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}{unit ? ` ${unit}` : ''}</span>; }
export function Metric({ label, value, hint, onClick, loading = false, tone = 'neutral' }) {
  const content = <><span className="erp-metric-label">{label}</span>{loading ? <Skeleton className="h-7 w-28" /> : <strong className="erp-number">{value}</strong>}{hint && <small>{hint}</small>}</>;
  return onClick ? <button type="button" onClick={onClick} className={`erp-metric erp-metric--${tone}`}>{content}</button> : <div className={`erp-metric erp-metric--${tone}`}>{content}</div>;
}
export function InlineAlert({ tone = 'info', title, children, role }) { return <div className={`erp-alert erp-alert--${tone}`} role={role || (tone === 'error' ? 'alert' : 'status')}><AlertCircle aria-hidden className="h-4 w-4" /><div>{title && <strong>{title}</strong>}{children && <p>{children}</p>}</div></div>; }
export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) { return <div className="erp-empty"><Icon aria-hidden /><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }
export function Skeleton({ className }) { return <span aria-hidden className={cn('erp-skeleton', className)} />; }
export function FormSection({ title, description, actions, children }) { return <section className="erp-form-section"><div className="erp-form-section__head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</div><div className="erp-form-section__body">{children}</div></section>; }

export function ScannerInput({ label = 'Scan or search', onSubmit, loading, error, ...props }) {
  const id = useId();
  return <div className="erp-scanner"><label htmlFor={id}>{label}</label><div><Search aria-hidden /><input id={id} inputMode="search" autoComplete="off" onKeyDown={(event) => { if (event.key === 'Enter' && event.currentTarget.value.trim()) onSubmit?.(event.currentTarget.value.trim(), event); }} {...props} />{loading && <Loader2 aria-label="Searching" className="animate-spin" />}</div>{error && <p role="alert">{error}</p>}</div>;
}
export function SmartFilter({ label, active = false, children, onClear }) { return <div className={cn('erp-filter', active && 'erp-filter--active')}><span>{label}</span>{children}{active && onClear && <button type="button" onClick={onClear} aria-label={`Clear ${label}`}><X /></button>}</div>; }

const DrawerDepthContext = createContext(0);
export function ActionDrawer({ open, onOpenChange, title, description, children, footer, onEscalate, wide = false, extraWide = false }) {
  const depth = useContext(DrawerDepthContext);
  const returnFocus = useRef(null);
  if (depth > 0) return null;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="erp-overlay" /><Dialog.Content className={`erp-drawer${wide ? ' erp-drawer--wide' : ''}${extraWide ? ' erp-drawer--extra-wide' : ''}`} onOpenAutoFocus={() => { returnFocus.current = document.activeElement; }} onCloseAutoFocus={(event) => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }}><DrawerDepthContext.Provider value={depth + 1}><div className="erp-drawer__head"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close asChild><button type="button" aria-label="Close"><X /></button></Dialog.Close></div><div className="erp-drawer__body">{children}</div>{(footer || onEscalate) && <div className="erp-drawer__foot">{onEscalate && <Button variant="outline" onClick={onEscalate}>Open full page</Button>}{footer}</div>}</DrawerDepthContext.Provider></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export const SidePanel = ActionDrawer;
export function ConfirmAction({ trigger, title, description, confirmLabel = 'Confirm', destructive = false, onConfirm, disabledReason }) {
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="erp-overlay" /><Dialog.Content className="erp-dialog"><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description>{disabledReason && <InlineAlert tone="warning">{disabledReason}</InlineAlert>}<div className="erp-dialog__actions"><Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close><Dialog.Close asChild><Button variant={destructive ? 'destructive' : 'default'} disabled={!!disabledReason} onClick={onConfirm}>{confirmLabel}</Button></Dialog.Close></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function DataTable({
  columns, rows, rowKey = 'id', loading, error, empty, onRowOpen, totals,
  selection, onSelectionChange, toolbar, pageInfo, onPageChange,
}) {
  const [active, setActive] = useState(0);
  if (loading) return <div className="erp-table-state" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>;
  if (error) return <InlineAlert tone="error" title="Could not load this list">{error}</InlineAlert>;
  if (!rows?.length) return empty || <EmptyState />;
  const selected = new Set(selection || []);
  return <div className="erp-table-shell">
    {toolbar && <div className="erp-table-toolbar">{toolbar}</div>}
    <div className="erp-table-wrap">
      <table className="erp-table">
        <thead><tr>
          {onSelectionChange && <th className="erp-cell-check"><span className="sr-only">Select</span></th>}
          {columns.map((col) => <th key={col.key} className={col.numeric ? 'erp-cell-number' : ''}>{col.label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr
            key={row[rowKey]}
            tabIndex={index === active ? 0 : -1}
            aria-selected={selected.has(row[rowKey])}
            onFocus={() => setActive(index)}
            className={onRowOpen ? 'cursor-pointer' : undefined}
            // One click opens the row; clicks on links, buttons and inputs inside it keep their own job.
            onClick={onRowOpen ? (event) => { if (!event.target.closest('a,button,input,select,textarea,label')) onRowOpen(row); } : undefined}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const next = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                setActive(next);
                event.currentTarget.parentElement.children[next]?.focus();
              }
              if (event.key === 'Enter') { event.preventDefault(); onRowOpen?.(row); }
            }}
          >
            {onSelectionChange && <td className="erp-cell-check"><input type="checkbox" aria-label={`Select row ${index + 1}`} checked={selected.has(row[rowKey])} onChange={(event) => onSelectionChange(event.target.checked ? [...selected, row[rowKey]] : [...selected].filter((id) => id !== row[rowKey]))} /></td>}
            {columns.map((col) => <td key={col.key} className={col.numeric ? 'erp-cell-number' : ''}>{col.render ? col.render(row) : row[col.key]}</td>)}
          </tr>
        ))}</tbody>
        {totals && <tfoot><tr><td colSpan={columns.length + (onSelectionChange ? 1 : 0)}>{totals}</td></tr></tfoot>}
      </table>
    </div>
    {pageInfo && <div className="erp-table-pagination"><span>Page {pageInfo.page} of {pageInfo.pages} · {pageInfo.total} results</span><div><Button variant="outline" size="sm" disabled={pageInfo.page <= 1} onClick={() => onPageChange?.(pageInfo.page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={pageInfo.page >= pageInfo.pages} onClick={() => onPageChange?.(pageInfo.page + 1)}>Next</Button></div></div>}
  </div>;
}
export const EntityTable = DataTable;
