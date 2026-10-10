import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastDemand,replenishment } from '../../lib/retail-forecast.js';
import { warrantyExpiry,evaluateWarranty,assertClaimTransition } from '../../lib/retail-warranty-rules.js';
const series=fn=>Array.from({length:112},(_,i)=>({units:fn(i)}));
test('warranty duration clamps calendar months and distinguishes returns from coverage',()=>{
  assert.equal(warrantyExpiry('2024-01-31T00:00:00Z',1,'MONTHS'),'2024-02-29T00:00:00.000Z');
  const snapshot={policy_id:1,terms:{},starts_at:'2026-01-01',expires_at:'2027-01-01'};
  assert.equal(evaluateWarranty({snapshot,now:'2026-06-01'}),'COVERED');
  assert.equal(evaluateWarranty({snapshot,now:'2027-01-01'}),'EXPIRED');
  assert.equal(evaluateWarranty({snapshot,refunded:true}),'ALREADY_REFUNDED');
  assert.equal(evaluateWarranty({snapshot,replaced:true}),'ALREADY_REPLACED');
  assert.equal(evaluateWarranty({snapshot:null}),'MANUAL_REVIEW_REQUIRED');
  assert.equal(evaluateWarranty({snapshot:{policy_id:null}}),'NO_WARRANTY');
  assert.throws(()=>assertClaimTransition('SUBMITTED','APPROVED'));
});
test('proof, identity and customer are server eligibility inputs',()=>{
  const snapshot={policy_id:1,customer_id:7,terms:{customer_required:1,proof_required:1},starts_at:'2026-01-01',expires_at:'2027-01-01'};
  assert.equal(evaluateWarranty({snapshot,customerId:8}),'PROOF_ISSUE');
  assert.equal(evaluateWarranty({snapshot,customerId:7,proof:true,serialValid:false}),'INVALID_SERIAL');
});
test('stable demand acceptance and reproducibility',()=>{
  const result=forecastDemand(series(()=>2));assert.equal(result.expected,28);assert.equal(result.backtest.mae,0);assert.equal(result.backtest.bias,0);
  assert.deepEqual(result,forecastDemand(series(()=>2)));
  const suggestion=replenishment(result,{available:5,incoming:0,leadDays:7,coverDays:14,mode:'FORECAST_ASSISTED'});
  assert.equal(suggestion.suggested,23);assert.equal(suggestion.days_cover,2.5);
});
for(const [name,fn] of [['rising',i=>1+i/20],['falling',i=>8-i/20],['weekly',i=>i%7===0?12:2]])test(`${name} demand backtest and bounded output`,()=>{
  const result=forecastDemand(series(fn));assert.ok(result.expected>0&&result.expected<200);assert.ok(Number.isFinite(result.backtest.mae));assert.equal(result.backtest.validation_days,14);
  if(name==='weekly')assert.equal(result.method,'WEEKLY_SEASONAL');
});
test('new and intermittent SKUs fall back without invented precision',()=>{
  for(const days of [series(()=>2).slice(0,3),series(i=>i%30===0?10:0)]){
    const result=forecastDemand(days);assert.equal(result.expected,null);assert.equal(result.backtest,null);
    assert.equal(replenishment(result,{mode:'FORECAST_ASSISTED',available:2,reorderPoint:5,reorderQuantity:10}).suggested,10);
  }
});
test('stockout censoring, promotions and zero denominators',()=>{
  const days=series(()=>2);days.splice(40,5,...Array.from({length:5},()=>({units:0,stockout:true})));days[50].promotion=true;
  const result=forecastDemand(days);assert.equal(result.expected,28);assert.ok(result.flags.includes('Stockout affected'));assert.ok(result.flags.includes('Promotion affected'));
  assert.equal(replenishment({daily:0},{available:5}).days_cover,null);
  assert.throws(()=>replenishment(result,{incoming:NaN}));assert.throws(()=>forecastDemand([{units:-1}]));
});


 test('channel shifts require samples and suppress confounded periods',async()=>{const {channelShiftSignals}=await import('../../lib/retail-forecast.js');const rows=[{channel:'ONLINE',recent_units:80,prior_units:20},{channel:'POS',recent_units:20,prior_units:80}];assert.equal(channelShiftSignals(rows).length,2);assert.equal(channelShiftSignals(rows,{confounded:true}).length,0);assert.equal(channelShiftSignals(rows,{minimum:200}).length,0);assert.equal(channelShiftSignals([{channel:'POS',recent_units:100,prior_units:100}]).length,0);});
