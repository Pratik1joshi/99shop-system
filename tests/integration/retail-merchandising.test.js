import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../lib/db/index.js';
import { previewVariantMatrix,exportCatalogCsv } from '../../lib/retail-catalog-matrix.js';
import { previewCatalogChange,applyCatalogChange,catalogRows,CATALOG_COLUMNS } from '../../lib/retail-merchandising.js';
import { findByBarcode } from '../../lib/product-catalog.js';
import { getProductMerchandising,saveProductMerchandising } from '../../lib/retail-product-merchandising.js';
import { resolveRetailPrices } from '../../lib/retail-pricing.js';
const db=Database.getInstance();test.after(()=>db.close());
test('Cosmetics matrix, atomic bulk edits and stable reimport',async t=>{
  const category=(await db.run("INSERT INTO menu_categories(name) VALUES ('Cosmetics matrix')")).lastInsertRowid;
  const product=(await db.run("INSERT INTO menu_items(name,category_id,base_price,is_available) VALUES ('Luxe Lip Color',?,500,1)",[category])).lastInsertRowid;
  const matrix=previewVariantMatrix({prefix:'LUXE',price:500,axes:[{name:'Shade',values:Array.from({length:50},(_,i)=>`Shade ${i+1}`)},{name:'Finish',values:['Matte','Gloss']}]});
  const selected=matrix.slice(0,82).map((row,i)=>({...row,barcode:`INT-LUXE-${i}`,barcodes:[`SUPPLIER-LUXE-${i}`],purchase_cost:200,wholesale_price:450}));
  let saved;
  await t.test('100 proposed, 82 selected; preview creates no SKU; apply replay retains identity',async()=>{
    const job=await previewCatalogChange(db,{product_id:product,rows:selected,reason:'Launch cosmetics'},1);
    assert.equal(job.create_count,82);assert.equal((await catalogRows(db,product)).length,0);
    saved=await applyCatalogChange(db,job.id,1);assert.equal(saved.count,82);
    assert.deepEqual(await applyCatalogChange(db,job.id,1),saved);
    for(let i=0;i<82;i++){assert.equal(Number((await findByBarcode(db,`INT-LUXE-${i}`)).variantId),saved.ids[i]);assert.equal(Number((await findByBarcode(db,`SUPPLIER-LUXE-${i}`)).variantId),saved.ids[i]);}
  });
  await t.test('Duplicate barcode and combinations blocked without partial rows',async()=>{
    await assert.rejects(previewCatalogChange(db,{product_id:product,reason:'Duplicates',rows:matrix.slice(82,84).map(row=>({...row,barcode:'DUPLICATE'}))},1),/duplicate/i);
    await assert.rejects(previewCatalogChange(db,{product_id:product,reason:'Duplicate combination',rows:[{...matrix[0],sku:'NEW-IDENTITY'}]},1),/already exists/i);
    assert.equal((await catalogRows(db,product)).length,82);
  });
  await t.test('CSV reimport updates 82 prices by five percent with same identities',async()=>{
    const rows=await catalogRows(db,product);
    const csv=exportCatalogCsv(rows.map(row=>({...row,price:Number(row.price)*1.05,attributes:JSON.stringify(row.attributes)})),CATALOG_COLUMNS);
    const job=await previewCatalogChange(db,{product_id:product,csv,reason:'Five percent retail increase'},1);
    assert.equal(job.update_count,82);assert.equal(job.create_count,0);
    assert.equal(Number(job.rows[0].before.price),500);assert.equal(job.rows[0].after.price,525);
    assert.deepEqual((await applyCatalogChange(db,job.id,1)).ids,saved.ids);
    assert.ok((await catalogRows(db,product)).every(row=>Number(row.price)===525));
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM inventory_movements')).count),0);
  });
  await t.test('Stale previews and another actor cannot apply changes',async()=>{
    const rows=await catalogRows(db,product);
    const job=await previewCatalogChange(db,{product_id:product,rows:[{...rows[0],price:530}],reason:'Stale price edit'},1);
    await assert.rejects(applyCatalogChange(db,job.id,999),/not found/i);
    await db.run('UPDATE menu_item_variants SET price=526 WHERE id=?',[rows[0].id]);
    await assert.rejects(applyCatalogChange(db,job.id,1),/changed after preview/i);
    assert.equal(Number((await db.get('SELECT price FROM menu_item_variants WHERE id=?',[rows[0].id])).price),526);
  });
  await t.test('Online fields, media and supplier data stay on the canonical product',async()=>{
    const supplier=(await db.run("INSERT INTO suppliers(name,normalized_name) VALUES ('Luxe supplier','luxe supplier')")).lastInsertRowid;
    await saveProductMerchandising(db,{product_id:product,brand:'Luxe',online_slug:'luxe-lip-color',online_enabled:true,online_title:'Luxe Lip Color',online_description:'Choose your shade.',reason:'Prepare online assortment',media:[{url:'https://example.com/luxe.jpg',alt:'Ruby matte',variant_id:saved.ids[0]}],suppliers:[{variant_id:saved.ids[0],supplier_id:supplier,supplier_sku:'LUXE-RM',minimum_order_quantity:6,preferred:true}]},1);
    const details=await getProductMerchandising(db,product);
    assert.equal(details.product.online_slug,'luxe-lip-color');assert.equal(details.media.length,1);assert.equal(details.suppliers[0].supplier_sku,'LUXE-RM');assert.deepEqual(details.history,[]);
    await assert.rejects(saveProductMerchandising(db,{product_id:product,reason:'Unsafe image',media:[{url:'javascript:alert(1)'}]},1),/HTTPS/);
    assert.deepEqual((await getProductMerchandising(db,product)).media,details.media);
  });
  await t.test('84-combination acceptance reports two duplicates then scans every corrected SKU',async()=>{
    const id=(await db.run("INSERT INTO menu_items(name,category_id,base_price,is_available) VALUES ('Professional Lip Color',?,600,1)",[category])).lastInsertRowid;
    const rows=matrix.slice(0,84).map((row,index)=>({...row,sku:`PRO-LIP-${index+1}`,barcode:`INT-PRO-LIP-${index+1}`,price:600,mrp:700,purchase_cost:250,wholesale_price:550,reorder_point:5,reorder_quantity:12}));
    const invalid=rows.map((row,index)=>({...row,barcode:index===82?rows[0].barcode:index===83?rows[1].barcode:row.barcode}));
    await assert.rejects(previewCatalogChange(db,{product_id:id,rows:invalid,reason:'84 shade launch'},1),/Row 83: duplicate.*Row 84: duplicate/);
    assert.equal((await catalogRows(db,id)).length,0);
    const preview=await previewCatalogChange(db,{product_id:id,rows,reason:'Corrected 84 shade launch'},1),result=await applyCatalogChange(db,preview.id,1);
    assert.equal(result.count,84);
    for(let index=0;index<84;index++)assert.equal(Number((await findByBarcode(db,rows[index].barcode)).variantId),result.ids[index]);
    assert.ok((await resolveRetailPrices(db,result.ids.map(variant_id=>({variant_id,quantity:1})))).every(price=>price.unit_price===600));
  });
  await t.test('Concurrent jobs cannot assign one barcode to two different SKUs',async()=>{
    const jobs=[];
    for(let index=0;index<2;index++){
      const id=(await db.run('INSERT INTO menu_items(name,category_id,base_price,is_available) VALUES (?,?,100,1)',[`Concurrent catalog ${index}`,category])).lastInsertRowid;
      jobs.push(await previewCatalogChange(db,{product_id:id,reason:'Concurrent barcode',rows:[{sku:`CONCURRENT-${index}`,variant_name:'Standard',price:100,barcode:'INT-CONCURRENT-SAME'}]},1));
    }
    const results=await Promise.allSettled(jobs.map(job=>applyCatalogChange(db,job.id,1)));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected').length,1);
    assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM menu_item_variants WHERE barcode='INT-CONCURRENT-SAME'")).count),1);
  });
});
