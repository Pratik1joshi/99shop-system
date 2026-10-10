'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';
import { apiJson } from '@/lib/authed-fetch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AdminField,
  adminInputClass,
  adminTextareaClass,
  adminDialogMd,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldStackClass,
} from '@/components/ui/admin-form';

/** Create or edit one supplier. `supplier` null means a new one. */
export default function SupplierFormModal({ supplier, onClose, onSaved }) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: supplier?.name || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
  });

  async function submit() {
    if (!form.name.trim()) {
      addToast(friendlyMessage('validation', { description: 'A supplier needs a name.' }));
      return;
    }
    setSaving(true);
    try {
      if (supplier?.id) {
        await apiJson('/api/admin/suppliers', { method: 'PUT', body: JSON.stringify({ ...form, id: supplier.id }) });
      } else {
        await apiJson('/api/admin/suppliers', { method: 'POST', body: JSON.stringify(form) });
      }
      addToast(friendlyMessage('save_success', { description: `${form.name} saved.` }));
      onSaved?.();
      onClose();
    } catch (error) {
      addToast(friendlyFromError(error, 'save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className={adminDialogMd}>
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : 'Add supplier'}</DialogTitle>
        </DialogHeader>
        <div className={`mt-6 ${adminFieldStackClass}`}>
          {[
            { key: 'name', label: 'Name', required: true },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'address', label: 'Address' },
          ].map((f) => (
            <AdminField key={f.key} label={f.label} required={f.required}>
              <input
                type={f.type || 'text'}
                autoFocus={f.key === 'name'}
                value={form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                className={adminInputClass}
              />
            </AdminField>
          ))}
          <AdminField label="Notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className={adminTextareaClass}
            />
          </AdminField>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={adminBtnSecondary}>
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={submit} className={adminBtnPrimary}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
