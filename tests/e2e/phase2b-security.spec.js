import {test,expect} from '@playwright/test';

test('published images are resized; receipt files and manual payment verification stay protected',async({page})=>{
  const catalog=await page.request.get('/api/storefront/catalog?query=Velvet');
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['cache-control']).toContain('no-store');
  const image=(await catalog.json()).products.find(p=>p.title==='Velvet lip colour').image;
  expect(image).toMatch(/^\/api\/storefront\/image\?id=/);
  const resized=await page.request.get(image);
  expect(resized.status()).toBe(200);
  expect(resized.headers()['content-type']).toBe('image/webp');
  expect((await resized.body()).length).toBeGreaterThan(100);
  expect((await page.request.get(image.replace('w=480','w=9999'))).status()).toBe(404);
  for(const path of ['/api/media/receipts/private.jpg','/uploads/receipts/private.jpg']){
    expect((await page.request.get(path)).status()).toBe(401);
  }
  await page.goto('/login');
  await page.getByRole('button',{name:/commerce_cashier/i}).click();
  await page.locator('#admin-pin').fill(process.env.E2E_CASHIER_PASSWORD||'CashierTest123');
  await page.getByRole('button',{name:/^Sign in$/i}).click();
  await expect(page).toHaveURL(/\/cashier\//);
  const headers={Authorization:`Bearer ${await page.evaluate(()=>localStorage.getItem('pos_token'))}`};
  expect((await page.request.get('/api/admin/retail-online-orders',{headers})).status()).toBe(200);
  const rejected=await page.request.post('/api/admin/retail-online-orders/99999999/fulfill',{headers,data:{payment_method:'online',payment_verified:true,payment_reference:'untrusted'}});
  expect(rejected.status()).toBe(403);
  await page.goto('/store/product/velvet-lip-colour');
  const mainImage=page.locator('.store-product-photo img');
  const first=await mainImage.getAttribute('src');
  await page.getByRole('button',{name:'View image 2',exact:true}).click();
  await expect(mainImage).not.toHaveAttribute('src',first);
  const add=page.getByRole('button',{name:'Add to bag'});
  await add.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added to your bag');
});
