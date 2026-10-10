'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/authed-fetch';

export default function RetailLoyaltySettingsPage() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { apiJson('/api/admin/retail-loyalty/settings').then((result) => setSettings(result.settings)).catch((e) => setError(e.error || e.message)); }, []);
  const update = (key, value) => { setSettings((current) => ({ ...current, [key]: value })); setSaved(false); };
  const save = async () => {
    setBusy(true); setError('');
    try { const result = await apiJson('/api/admin/retail-loyalty/settings', { method: 'PUT', body: JSON.stringify(settings) }); setSettings(result.settings); setSaved(true); }
    catch (e) { setError(e.error || e.message); } finally { setBusy(false); }
  };
  return <div className="retail-money-page"><header className="retail-money-heading"><div><p className="retail-eyebrow">CUSTOMERS / REWARDS</p><h1>Loyalty rules</h1><p>Points are rewards. Redemption reduces a sale before payment and does not create cash or store credit.</p></div></header>
    {error && <p className="retail-money-error" role="alert">{error}</p>}
    {saved && <p role="status">Loyalty rules saved and audited.</p>}
    {!settings ? <p>Loading rules…</p> : <section className="retail-money-card"><div className="retail-money-form"><label>Earn one point per Rs<input type="number" min="0.01" step="0.01" value={settings.earnRateAmount} onChange={(e) => update('earnRateAmount', e.target.value)} /></label><label>Points per Rs redeemed<input type="number" min="0.01" step="0.01" value={settings.pointsPerCurrency} onChange={(e) => update('pointsPerCurrency', e.target.value)} /></label><label>Maximum redemption % of sale<input type="number" min="1" max="100" step="1" value={settings.redeemMaxPercent} onChange={(e) => update('redeemMaxPercent', e.target.value)} /></label><label><input type="checkbox" checked={settings.enabled} onChange={(e) => update('enabled', e.target.checked)} /> Program enabled</label><button disabled={busy} onClick={save}>Save rules</button></div><p>Tier thresholds are fixed by the current program and are shown on customer profiles.</p></section>}
  </div>;
}
