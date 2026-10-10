'use client';
import { useState } from 'react';
import { apiJson } from '@/lib/authed-fetch';
import { Button } from '@/components/ui/button';
export default function ProductBarcodes({ product, onRefresh, canManage }) {
  const [barcode,setBarcode] = useState('');
  const [variantId,setVariantId] = useState(product.variants[0]?.id || '');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function add() {
    setBusy(true); setError('');
    try { await apiJson(`/api/admin/products/${product.id}/barcodes`, { method: 'POST', body: JSON.stringify({ barcode, variantId, barcodeType: 'other' }) }); setBarcode(''); await onRefresh(); }
    catch(error) { setError(error.error || 'Could not add barcode'); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    setBusy(true); setError('');
    try { await apiJson(`/api/admin/products/${product.id}/barcodes?barcodeId=${id}`, { method: 'DELETE' }); await onRefresh(); }
    catch (error) { setError(error.error || 'Could not remove barcode'); }
    finally { setBusy(false); }
  }
  return <div className="commerce-form">
    {product.barcodes.length ? product.barcodes.map((b) => <div key={b.id} className="commerce-barcode-row"><span>{b.barcode} · {b.barcode_type} · {product.variants.find((v) => Number(v.id) === Number(b.variant_id))?.sku || 'Product'}</span>{canManage && !b.is_primary && <Button type="button" variant="outline" disabled={busy} onClick={() => remove(b.id)}>Remove</Button>}</div>) : <p>No additional barcodes.</p>}
    {canManage && <><label>SKU<select value={variantId} onChange={(e) => setVariantId(e.target.value)}>{product.variants.filter((v) => v.id).map((v) => <option key={v.id} value={v.id}>{v.sku || v.variant_name}</option>)}</select></label><label>Additional barcode<input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></label><Button type="button" disabled={!barcode.trim() || busy} onClick={add}>Add barcode</Button>{error && <p role="alert">{error}</p>}</>}
  </div>;
}
