import test from 'node:test';
import assert from 'node:assert/strict';
import {financeVisibility,analyticsVisibility} from '../../lib/retail-finance-visibility.js';
test('finance summary cannot bypass blind cash, banking, inventory or GL restrictions',()=>{
  const data={control:{cash:10,bank:20,inventory:30,accounts_payable:40},trial_balance:{debit:50,credit:50},attention:{outstanding_payable:40}};
  const redacted=financeVisibility(data,{can:()=>false,cashVisible:false});
  assert.deepEqual(redacted.control,{cash:null,bank:null,inventory:null,accounts_payable:null});
  assert.equal(redacted.trial_balance,null);assert.equal(redacted.attention.outstanding_payable,null);
  assert.equal(data.control.cash,10);
  assert.deepEqual(financeVisibility(data,{can:()=>true,cashVisible:true}),data);
});
test('analytics strips restricted fields before screen or CSV consumption, including ranking side channels',()=>{
  const data={netSales:100,cogs:40,grossProfit:60,cashPosition:1000,inventoryValue:90,supplierPayables:30,netProfit:20,
    rows:[{label:'SKU',cogs:40,grossProfit:60,marginPercent:60}],topByProfit:[{label:'SKU'}]};
  const visible=analyticsVisibility(data,{can:()=>false,cashVisible:false});
  assert.deepEqual(visible,{netSales:100,rows:[{label:'SKU'}]});
  assert.deepEqual(analyticsVisibility(data,{can:()=>true,cashVisible:true}),data);
});
