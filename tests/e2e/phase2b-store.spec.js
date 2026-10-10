import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import pg from 'pg';
const fixture=JSON.parse(fs.readFileSync('.commerce-tmp/phase2b/browser-fixture.json','utf8'));
const signIn=async page=>{await page.goto('/login');await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN||'KmTestOnly123');await page.getByRole('button',{name:/^Sign in$/i}).click();await expect(page).toHaveURL(/\/admin\/dashboard/);return page.evaluate(()=>localStorage.getItem('pos_token'));};
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
test('guest pickup: exact variant, cart, order, staff fulfillment and canonical return request',async({page},info)=>{
  test.setTimeout(120000);
  await page.goto('/store');await expect(page.getByRole('heading',{name:'The Everyday Edit'})).toBeVisible();
  await page.getByLabel('Search',{exact:true}).fill('Velvet');await page.getByRole('link',{name:/Velvet lip colour/}).click();
  await expect(page.getByRole('heading',{name:'Velvet lip colour'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Gloss',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Rose',exact:true}).click();await expect(page.getByRole('button',{name:'Gloss',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Add to bag'}).click();await expect(page.getByRole('status')).toContainText('Added to your bag');await noOverflow(page);
  await page.getByRole('link',{name:/View bag/}).click();await page.getByLabel('Full name').fill('Guest Browser');await page.getByLabel('Phone',{exact:true}).fill('9801112222');
  await expect(page.getByRole('button',{name:'Place order',exact:true})).toBeEnabled();await noOverflow(page);await page.screenshot({path:`.commerce-tmp/phase2b/checkout-${info.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page).toHaveURL(/\/store\/orders\/\d+/);const id=page.url().split('/').at(-1);
  await expect(page.getByText(/CONFIRMED.*UNPAID/)).toBeVisible();await noOverflow(page);
  const headers={Authorization:`Bearer ${await signIn(page)}`};
  await page.goto('/admin/retail-online-orders');await page.getByLabel('Search order, customer or phone').fill('Guest Browser');await expect(page.getByRole('heading',{name:'Online Orders',exact:true})).toBeVisible();
  await page.goto('/admin/retail-online-orders/'+id);await expect(page.getByRole('heading',{name:'Collect payment & fulfill'})).toBeVisible();
  await page.getByLabel('I verified that payment has been received').check();await page.getByRole('button',{name:/Fulfill.*Create Sale/}).click();
  await expect(page.getByRole('button',{name:/View linked sale/})).toBeVisible();
  const replay=await page.request.post(`/api/admin/retail-online-orders/${id}/fulfill`,{headers,data:{payment_verified:true,payment_method:'cash'}});expect(replay.status(),await replay.text()).toBe(200);
  await page.goto('/store/orders/'+id);await expect(page.getByText(/DELIVERED.*PAID/)).toBeVisible();
  await page.getByLabel('Reason',{exact:true}).fill('Please help arrange a return');await page.getByRole('button',{name:'Request a return'}).click();await expect(page.getByRole('status')).toContainText('Return request recorded');
});
test('delivery QR remains pending; owner-only access, cancellation and public security',async({page,browser})=>{
  test.setTimeout(90000);await page.goto('/store/cart');await page.evaluate(id=>localStorage.setItem('aadhar_bag',JSON.stringify([{variant_id:id,quantity:1}])),fixture.variant);await page.reload();
  await page.getByLabel('Full name').fill('Delivery Browser');await page.getByLabel('Phone',{exact:true}).fill('9802223333');await page.getByLabel('Receive your order').selectOption('DELIVERY');await page.getByLabel('Delivery address').fill('123 Kathmandu, Nepal');await page.getByRole('combobox',{name:'Payment',exact:true}).selectOption('online');
  await expect(page.getByRole('button',{name:'Place order',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page).toHaveURL(/\/store\/orders\/\d+/);const id=page.url().split('/').at(-1);
  await expect(page.locator('.store-order-status')).toHaveText(/CONFIRMED.*PENDING/);
  const stranger=await browser.newContext();const attack=await stranger.request.get(new URL('/api/storefront/order?id='+id,page.url()).href);expect([401,404]).toContain(attack.status());await stranger.close();
  const cross=await page.request.post('/api/storefront/cancel',{headers:{Origin:'https://attacker.invalid'},data:{id}});expect(cross.status()).toBe(403);
  const admin=await page.request.get('/api/admin/retail-online-orders');expect(admin.status()).toBe(401);
  await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.getByText(/CANCELLED/).first()).toBeVisible();await noOverflow(page);
});
test('verified account can activate and see safe canonical balances and history',async({page},info)=>{
  test.setTimeout(90000);const headers={Authorization:`Bearer ${await signIn(page)}`},suffix=Date.now();
  const created=await page.request.post('/api/admin/customers',{headers,data:{name:`Web ${info.project.name}`,phone:`98${String(suffix).slice(-8)}`}});expect(created.status(),await created.text()).toBe(201);const customer=(await created.json()).customer;
  const invited=await page.request.post('/api/admin/commerce/storefront',{headers,data:{action:'invite',customer_id:customer.id,identity_verified:true}});expect(invited.status()).toBe(200);
  await page.goto('/store/account');await page.getByLabel('Account access').selectOption('activate');await page.getByLabel('Activation code').fill((await invited.json()).activation_code);await page.getByLabel('Username',{exact:true}).fill('browser.'+suffix);await page.getByLabel('Password',{exact:true}).fill('CustomerTest123!');await page.getByRole('button',{name:'Activate account',exact:true}).click();
  await expect(page.getByRole('heading',{name:`Hello, Web ${info.project.name}`})).toBeVisible();await page.getByRole('button',{name:'View purchase and balance history'}).click();await expect(page.getByRole('heading',{name:'Purchases',exact:true})).toBeVisible();await noOverflow(page);
  await page.evaluate(id=>localStorage.setItem('aadhar_bag',JSON.stringify([{variant_id:id,quantity:1}])),fixture.variant);await page.goto('/store/cart');await page.getByLabel('Full name').fill(`Web ${info.project.name}`);await page.getByLabel('Phone',{exact:true}).fill('9802221111');await expect(page.getByRole('button',{name:'Place order',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page).toHaveURL(/\/store\/orders\/\d+/);await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.getByText(/CANCELLED/).first()).toBeVisible();
  await page.goto('/store/account');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();expect((await page.request.get('/api/storefront/history')).status()).toBe(401);
});
test('changed checkout price needs a second explicit acknowledgement',async({page})=>{
  test.setTimeout(90000);
  const connection=fs.readFileSync('.commerce-tmp/phase2b/browser.env','utf8').split('\n').find(l=>l.startsWith('DATABASE_URL=')).slice(13),url=new URL(connection);
  if(url.hostname!=='127.0.0.1'||!url.pathname.startsWith('/phase2b_browser_'))throw new Error('Disposable browser fixture required');
  const db=new pg.Client({connectionString:connection});await db.connect();
  try{
    await page.goto('/store');await page.evaluate(id=>localStorage.setItem('aadhar_bag',JSON.stringify([{variant_id:id,quantity:1}])),fixture.variant);await page.goto('/store/cart');await page.getByLabel('Full name').fill('Price Browser');await page.getByLabel('Phone',{exact:true}).fill('9801231231');await expect(page.getByRole('button',{name:'Place order',exact:true})).toBeEnabled();
    await db.query('UPDATE menu_item_variants SET price=105 WHERE id=$1',[fixture.variant]);await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Price updated'})).toContainText('Price updated from Rs 100.00 to Rs 105.00');expect(page.url()).toContain('/store/cart');
    await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page).toHaveURL(/\/store\/orders\/\d+/);await page.getByRole('button',{name:'Cancel order',exact:true}).click();await expect(page.getByText(/CANCELLED/).first()).toBeVisible();
  }finally{await db.query('UPDATE menu_item_variants SET price=100 WHERE id=$1',[fixture.variant]);await db.end();}
});
