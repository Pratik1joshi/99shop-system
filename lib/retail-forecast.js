// Pure, deterministic decision support. Units are gross fulfilled demand; returns are separate.
const mean = values => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
const round = n => Math.round(n * 1000) / 1000;
const models = {
  RECENT_AVERAGE: (days, horizon) => Array(horizon).fill(mean(days.slice(-28).filter(d => !d.stockout).map(d => d.units))),
  WEIGHTED_AVERAGE: (days, horizon) => {
    const valid = days.slice(-28).filter(d => !d.stockout);
    const value = valid.reduce((sum, d, i) => sum + d.units * (i + 1), 0) / (valid.length * (valid.length + 1) / 2 || 1);
    return Array(horizon).fill(value);
  },
  EXPONENTIAL_SMOOTHING: (days, horizon) => {
    const valid = days.filter(d => !d.stockout); let level = valid[0]?.units || 0;
    for (const d of valid.slice(1)) level = .25 * d.units + .75 * level;
    return Array(horizon).fill(level);
  },
  WEEKLY_SEASONAL: (days, horizon) => Array.from({ length: horizon }, (_, i) => {
    const values = []; for (let n = days.length - 7 + i % 7; n >= Math.max(0, days.length - 56); n -= 7) if (!days[n].stockout) values.push(days[n].units);
    return mean(values);
  }),
};
export function forecastDemand(days, { horizon = 14 } = {}) {
  if (![7, 14, 30].includes(horizon)) throw new Error('Forecast horizon must be 7, 14 or 30 days.');
  if (!Array.isArray(days) || days.length > 366 || days.some(d => !Number.isFinite(d.units) || d.units < 0)) throw new Error('Invalid demand history.');
  const valid = days.filter(d => !d.stockout), active = valid.filter(d => d.units > 0).length;
  const flags = []; if (days.some(d => d.stockout)) flags.push('Stockout affected');
  if (days.some(d => d.promotion)) flags.push('Promotion affected');
  const base = { algorithm: 'baseline-v1', horizon, history_days: days.length, observed_days: valid.length, flags };
  if (valid.length < 28) return { ...base, evidence: days.length < 14 ? 'New product' : valid.length < 14 ? 'No reliable forecast' : 'Limited history', method: null, expected: null, daily: null, backtest: null, reason: 'Insufficient SKU history. Use the merchant reorder rule.' };
  if (active / valid.length < .25) return { ...base, evidence: 'Intermittent', method: null, expected: null, daily: null, backtest: null, reason: 'Sporadic demand. Use the merchant reorder rule.' };
  const validation = Math.min(14, Math.floor(days.length / 4)), train = days.slice(0, -validation), actual = days.slice(-validation);
  const candidates = Object.entries(models).filter(([key]) => key !== 'WEEKLY_SEASONAL' || train.length >= 56);
  const scores = candidates.map(([method, predict]) => {
    const prediction = predict(train, validation), errors = actual.flatMap((d, i) => d.stockout ? [] : [{ error: prediction[i] - d.units, actual: d.units }]);
    const volume = errors.reduce((n, d) => n + d.actual, 0), absolute = errors.reduce((n, d) => n + Math.abs(d.error), 0);
    return { method, mae: errors.length ? absolute / errors.length : null, wape: volume ? absolute / volume : null, bias: errors.length ? mean(errors.map(d => d.error)) : null, observations: errors.length };
  }).filter(s => s.mae !== null).sort((a, b) => a.mae - b.mae || a.method.localeCompare(b.method));
  if (!scores.length) return { ...base, method: null, expected: null, daily: null, backtest: null, evidence: 'Limited history', reason: 'No uncensored validation days. Use the merchant reorder rule.' };
  const selected = scores[0], prediction = models[selected.method](days, horizon), daily = mean(prediction);
  const average = mean(valid.map(d => d.units)), sd = Math.sqrt(mean(valid.map(d => (d.units - average) ** 2)));
  return { ...base, evidence: sd > average ? 'Volatile' : valid.length >= 84 ? 'Strong history' : 'Moderate history', method: selected.method,
    expected: round(prediction.reduce((a, b) => a + b, 0)), daily: round(daily), prediction: prediction.map(round),
    backtest: { ...selected, validation_days: validation, training_days: train.length, candidates: scores },
    reason: 'Lowest held-out MAE among eligible baseline methods. Stockout days are excluded from fitting and scoring; missing demand is not fabricated.' };
}
export function replenishment(forecast, { available = 0, incoming = 0, leadDays = 0, coverDays = 14, safetyQuantity = 0, safetyDays = 0, reorderPoint = 0, reorderQuantity = 0, mode = 'REORDER_POINT', maximum = 0 } = {}) {
  const inputs = { available, incoming, leadDays, coverDays, safetyQuantity, safetyDays, reorderPoint, reorderQuantity, maximum };
  if (Object.values(inputs).some(n => !Number.isFinite(n) || n < 0)) throw new Error('Replenishment inputs must be finite nonnegative numbers.');
  if (!['MANUAL', 'MIN_MAX', 'REORDER_POINT', 'FORECAST_ASSISTED'].includes(mode)) throw new Error('Unknown replenishment policy.');
  const forecastable = mode === 'FORECAST_ASSISTED' && forecast.daily !== null, days = Math.max(leadDays, coverDays);
  const safety = safetyQuantity + (forecastable ? forecast.daily * safetyDays : 0);
  const target = forecastable ? forecast.daily * days + safety : mode === 'MIN_MAX' ? maximum : reorderPoint;
  const suggested = mode === 'MANUAL' ? 0 : forecastable ? Math.ceil(Math.max(0, target - available - incoming)) : available + incoming <= reorderPoint ? Math.ceil(Math.max(reorderQuantity, target - available - incoming, 0)) : 0;
  return { ...inputs, mode, basis: forecastable ? 'FORECAST' : 'REORDER_RULE', target: round(target), safety: round(safety), suggested,
    days_cover: forecast.daily > 0 ? round(available / forecast.daily) : null,
    reason: forecastable ? `Demand for ${days} days plus ${round(safety)} safety units, less available and approved incoming.` : 'Merchant reorder policy; no precise SKU forecast is implied.' };
}

// Compare channel mix only when both periods have enough canonical sold units.
export function channelShiftSignals(channels,{minimum=30,threshold=.25,confounded=false}={}){
  const recent=channels.reduce((n,c)=>n+Number(c.recent_units||0),0),prior=channels.reduce((n,c)=>n+Number(c.prior_units||0),0);
  if(confounded||recent<minimum||prior<minimum)return [];
  return channels.flatMap(c=>{const current=Number(c.recent_units||0)/recent,previous=Number(c.prior_units||0)/prior;return Math.abs(current-previous)>=threshold?[{type:'CHANNEL_SHIFT',channel:c.channel,recent_share:current,prior_share:previous,share_change:current-previous,threshold,recent_total_units:recent,prior_total_units:prior,reason:'Channel share of posted units: latest seven days versus the preceding 28 days. Known stockout/promotion weeks are suppressed; closures or channel availability may explain the change.',href:'/admin/retail-analytics'}]:[];});
}
