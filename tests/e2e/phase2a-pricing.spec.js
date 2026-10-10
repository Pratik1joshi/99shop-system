import { test,expect } from '@playwright/test';
test('owner schedules a price tier, activates it and sees the server-selected price',async({page})=>{
  test.setTimeout(120000);await page.goto('/login');await page.locator('#admin-pin').fill(process.env.E2E_ADMIN_PIN||'KmTestOnly123');await page.getByRole('button',{name:/^Sign in$/i}).click();await expect(page).toHaveURL(/\/admin\/dashboard/);
  const name=`Pricing browser ${Date.now()}`;
  const product=await page.evaluate(async name=>{const headers={Authorization:`Bearer ${localStorage.getItem('pos_token')}`,'Content-Type':'application/json'};const created=await(await fetch('/api/admin/commerce/products',{method:'POST',headers,body:JSON.stringify({name,price:100})})).json();return(await fetch(`/api/admin/commerce/products?id=${created.id}`,{headers})).json();},name);
  const variantId=product.product.variants[0].id;
  await page.goto('/admin/products/pricing');await page.getByRole('button',{name:'New price list',exact:true}).click();let drawer=page.getByRole('dialog',{name:'New price list'});
  await drawer.getByLabel('Name',{exact:true}).fill(name);await drawer.getByLabel('Code',{exact:true}).fill(`BROWSER-${variantId}`);await drawer.getByLabel('Priority',{exact:true}).fill('25');await drawer.getByLabel('Starts at (UTC)').fill('2099-10-01T00:00');await drawer.getByLabel('Find SKU for a rule').fill(name);await drawer.getByRole('button',{name:new RegExp(name)}).click();await drawer.getByLabel('min_quantity rule 1').fill('3');await drawer.getByLabel('fixed_price rule 1').fill('90');await drawer.getByLabel('Change reason').fill('Future wholesale tier test');
  await expect(drawer.getByRole('button',{name:'Save price list',exact:true})).toBeInViewport({ratio:1});await drawer.getByRole('button',{name:'Save price list',exact:true}).click();await expect(drawer).toBeHidden();
  const quote=async()=>page.evaluate(async id=>{const response=await fetch('/api/admin/commerce/quote',{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('pos_token')}`,'Content-Type':'application/json'},body:JSON.stringify({lines:[{variant_id:id,quantity:3,unit_price:0.01}]})});return response.json();},variantId);
  expect((await quote()).pricing[0].unit_price).toBe(100);
  await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click();drawer=page.getByRole('dialog',{name:'Edit price list'});await drawer.getByLabel('Starts at (UTC)').fill('');await drawer.getByLabel('Change reason').fill('Activate tested quantity tier');
  await expect(drawer.getByRole('button',{name:'Save price list',exact:true})).toBeInViewport({ratio:1});await drawer.getByRole('button',{name:'Save price list',exact:true}).click();await expect(drawer).toBeHidden();
  const priced=await quote();expect(priced.pricing[0].unit_price).toBe(90);expect(priced.pricing[0].reason).toContain('3+ quantity tier');expect(priced.subtotal).toBe(270);
});
test('merchandising and pricing data require authentication',async({request})=>{
  for(const path of ['pricing','merchandising?product_id=1','product-merchandising?id=1','catalog-setup','labels?ids=1']){
    const response=await request.get(`/api/admin/commerce/${path}`);expect(response.status()).toBe(401);
  }
});
