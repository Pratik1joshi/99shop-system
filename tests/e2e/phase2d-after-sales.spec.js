import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync('.commerce-tmp/phase2d/browser-fixture.json','utf8'));
const login=async page=>{await page.goto('/login');await page.locator('#admin-pin').fill('KmTestOnly123');await page.getByRole('button',{name:/^Sign in$/}).click();await expect(page).toHaveURL(/\/admin\/dashboard/);};
const form=async(page,title)=>{const details=page.locator('details').filter({has:page.locator('summary',{hasText:title})});await details.locator('summary').click();return details;};
test('staff serial lookup, inspection, replacement and responsive worklist',async({page},info)=>{
  test.setTimeout(150000);const f=fixture.customers[info.project.name];await login(page);await page.goto('/admin/retail-after-sales');
  await page.getByRole('button',{name:'New claim / purchase lookup'}).click();await page.getByLabel('Search after-sales').fill(f.staff_serial);await page.getByRole('row').filter({has:page.getByText(f.staff_serial,{exact:true})}).getByRole('button',{name:'Start claim'}).click();
  await page.getByLabel('Issue type',{exact:true}).fill('Motor failure');await page.getByLabel('Customer description',{exact:true}).fill('Motor stopped');await page.getByRole('button',{name:'Create claim',exact:true}).click();
  await expect(page.getByRole('heading',{name:/WC-.*Warranty acceptance dryer/})).toBeVisible();
  let panel=await form(page,'Update custody / complete claim');await panel.getByLabel('Next state').selectOption('RECEIVED');await panel.getByLabel('Received condition',{exact:true}).fill('Housing intact');await panel.getByRole('button').click();await expect(page.getByText('Custody: store',{exact:true})).toBeVisible();
  panel=await form(page,'Record inspection');await panel.getByLabel('Received condition',{exact:true}).fill('Housing intact');await panel.getByLabel('Observed fault').fill('Motor failed');await panel.getByLabel('Test result').fill('Power present; motor fails');await panel.getByLabel('Proof verified').check();await panel.getByRole('button').click();
  panel=await form(page,'Approve coverage');await panel.getByRole('button').click();await expect(page.getByText('approved',{exact:true})).toBeVisible();
  panel=await form(page,'Issue replacement');await panel.getByLabel('Find replacement SKU').fill('WARRANTY-DRYER');await panel.getByRole('button',{name:/Warranty acceptance dryer/}).click();await panel.getByLabel('Scan replacement serial').fill(f.replacement_serial);await panel.getByRole('button',{name:'Issue replacement',exact:true}).click();await expect(page.getByText('Resolution: replaced',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.commerce-tmp/phase2d/after-sales-${info.project.name}.png`,fullPage:true});
});
test('customer submits and sees only customer-safe service status',async({page},info)=>{
  test.setTimeout(100000);const f=fixture.customers[info.project.name];await page.goto('/store/account');await page.getByLabel('Username',{exact:true}).fill('service_'+info.project.name);await page.getByLabel('Password',{exact:true}).fill('WarrantyBrowser123');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Hello, Service '+info.project.name})).toBeVisible();
  await page.getByRole('link',{name:'Warranty & service requests'}).click();await page.getByRole('button',{name:new RegExp(f.customer_serial)}).click();await page.getByLabel('What happened?').fill('The motor stops after a minute.');await page.getByRole('button',{name:'Submit request'}).click();await expect(page.getByText('Request received',{exact:true})).toBeVisible();
  const response=await page.request.get('/api/storefront/warranty');expect(response.status()).toBe(200);const body=await response.json();for(const claim of body.data){expect(claim).not.toHaveProperty('internal_note');expect(claim).not.toHaveProperty('request_hash');expect(claim).not.toHaveProperty('economics');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.commerce-tmp/phase2d/customer-${info.project.name}.png`,fullPage:true});
});
test('intelligence explains fallback and creates only a draft PO',async({page},info)=>{
  test.setTimeout(100000);await login(page);await page.goto('/admin/retail-operations');await page.getByLabel('Find SKU').fill('WARRANTY-DRYER');await page.getByRole('button',{name:/Warranty acceptance dryer/}).click();await expect(page.getByText('Insufficient history',{exact:true})).toBeVisible();
  await page.getByLabel('Order quantity').fill('12');await page.getByLabel('Supplier ID',{exact:true}).fill(String(fixture.supplier));await page.getByLabel('Unit cost',{exact:true}).fill('100');await page.getByLabel('Decision / override reason').fill('Reviewed opening demand '+info.project.name);await page.getByRole('button',{name:'Create draft PO'}).click();await expect(page.getByRole('link',{name:'Open draft purchase order'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.commerce-tmp/phase2d/operations-${info.project.name}.png`,fullPage:true});await page.reload();await expect(page.getByText(/Attention and product quality worklist/)).toBeVisible();
});
test('unauthenticated and default cashier access are denied',async({page})=>{
  test.setTimeout(90000);for(const path of ['/api/admin/retail-after-sales','/api/admin/retail-operations','/api/storefront/warranty'])expect((await page.request.get(path)).status()).toBe(401);
  await page.goto('/login');await page.getByRole('button',{name:/warranty_cashier/i}).click();await page.locator('#admin-pin').fill('CashierTestOnly123');await page.getByRole('button',{name:/^Sign in$/}).click();await expect(page).toHaveURL(/\/cashier\//);
  const token=await page.evaluate(()=>localStorage.getItem('pos_token')),headers={Authorization:`Bearer ${token}`};
  for(const path of ['/api/admin/retail-after-sales','/api/admin/retail-operations'])expect((await page.request.get(path,{headers})).status()).toBe(403);
  expect((await page.request.post('/api/admin/retail-after-sales',{headers,data:{action:'approve',id:1,idempotency_key:'hostile-cashier'}})).status()).toBe(403);
});
