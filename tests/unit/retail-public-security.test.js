import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStoreOrigin,publicBody} from '../../lib/retail-public-security.js';
import {cleanPublicLines} from '../../lib/retail-storefront.js';
import {publicPrice,quoteFingerprint} from '../../lib/retail-public-price.js';
import {staffOrderView,orderDimensions} from '../../lib/retail-order-view.js';
test('public mutations require browser origin and tolerate Next hostname normalization',()=>{
  assert.doesNotThrow(()=>assertStoreOrigin({url:'http://localhost:3026/api/storefront/quote',headers:new Headers({host:'127.0.0.1:3026',origin:'http://127.0.0.1:3026'})}));
  for(const origin of ['https://attacker.example','null',''])assert.throws(()=>assertStoreOrigin({url:'https://shop.example/api/storefront/quote',headers:new Headers({host:'shop.example',origin})}),/origin/);
});
test('public request body rejects large, invalid and non-object payloads',async()=>{
  const req=body=>new Request('https://shop.example/api/storefront/orders',{method:'POST',headers:{origin:'https://shop.example'},body});
  for(const body of ['null','[]','42','{'])await assert.rejects(publicBody(req(body)),/Invalid/);
  await assert.rejects(publicBody(req('x'.repeat(32769))),/too large/);
  assert.deepEqual(await publicBody(req('{"lines":[]}')),{lines:[]});
});
test('public quantities are bounded exact SKU intent and duplicate rows cannot bypass the cap',()=>{
  for(const lines of [[null],[{variant_id:1,quantity:Infinity}],[{variant_id:1,quantity:0.1}],[{variant_id:1,quantity:-1}],[{variant_id:1,quantity:50},{variant_id:1,quantity:50}]])assert.throws(()=>cleanPublicLines(lines));
  assert.deepEqual(cleanPublicLines([{variant_id:2,quantity:1,unit_price:0.01},{variant_id:2,quantity:2}]),[{variant_id:2,quantity:3}]);
});
test('public prices cannot leak rule identity or margin evidence',()=>{
  assert.deepEqual(publicPrice({unit_price:10,reason:'Internal cost list',price_rule_id:123,price_list_id:456,unit_cost:8,base_price:20}),{unit_price:10,reason:'Online price'});
});
test('quote acknowledgement detects changed line prices even when order total stays constant',()=>{
  const q={pricing:[{variant_id:1,quantity:1,unit_price:10},{variant_id:2,quantity:1,unit_price:20}],subtotal:30,discount:0,tax:0,total:30};
  assert.equal(quoteFingerprint(q),quoteFingerprint({...q,pricing:[...q.pricing].reverse()}));
  assert.notEqual(quoteFingerprint(q),quoteFingerprint({...q,pricing:[{variant_id:1,quantity:1,unit_price:11},{variant_id:2,quantity:1,unit_price:19}]}));
});
test('staff order contracts separate dimensions and exclude secrets and pricing evidence',()=>{
  const view=staffOrderView({id:1,status:'READY',fulfillment_type:'PICKUP',payment_status:'UNPAID',owner_hash:'secret',request_hash:'private',quote_json:'costs',idempotency_key:'key'});
  assert.equal(view.order_status,'CONFIRMED');assert.equal(view.fulfillment_status,'READY_FOR_PICKUP');assert.equal(view.payment_status,'UNPAID');
  assert.ok(!/secret|private|costs|idempotency_key/.test(JSON.stringify(view)));
  assert.equal(orderDimensions({status:'READY',reservation_expires_at:'2000-01-01'}).status,'EXPIRED');
});
