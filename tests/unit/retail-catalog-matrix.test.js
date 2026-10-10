import test from 'node:test';
import assert from 'node:assert/strict';
import { previewVariantMatrix,parseCatalogCsv,exportCatalogCsv,attributeSignature } from '../../lib/retail-catalog-matrix.js';
test('50 shades by two finishes proposes 100 deterministic identities without persisting',()=>{
  const input={prefix:'Luxe Lip',price:500,axes:[{name:'Shade',values:Array.from({length:50},(_,i)=>`Shade ${i+1}`)},{name:'Finish',values:['Matte','Gloss']}]};
  const rows=previewVariantMatrix(input);assert.equal(rows.length,100);assert.equal(new Set(rows.map(row=>row.sku)).size,100);
  assert.deepEqual(previewVariantMatrix(input),rows);
  assert.equal(rows.filter((_,i)=>i<82).length,82);
  assert.equal(attributeSignature({Shade:'Ruby',Finish:'Matte'}),attributeSignature({Finish:'Matte',Shade:'Ruby'}));
  assert.throws(()=>previewVariantMatrix({...input,axes:[{name:'Shade',values:['Ruby','Ruby']}]}),/Duplicate/);
  const coded=previewVariantMatrix({prefix:'MAY-LIP',sku_style:'attributes',axes:[{name:'Shade',values:['Ruby'],codes:{Ruby:'RUB'}},{name:'Finish',values:['Matte'],codes:{Matte:'MAT'}}]});
  assert.equal(coded[0].sku,'MAY-LIP-RUB-MAT');
});
test('CSV handles quotes, commas, multiline values and blocks malformed input',()=>{
  const rows=[{sku:'LUXE-1',name:'Ruby, "Matte"\nShade',price:123.45}];
  assert.deepEqual(parseCatalogCsv(exportCatalogCsv(rows,['sku','name','price'])),[{...rows[0],price:'123.45'}]);
  assert.throws(()=>parseCatalogCsv('sku,sku\n1,2'),/unique/);
  assert.throws(()=>parseCatalogCsv('sku,name\n1'),/columns/);
  assert.throws(()=>parseCatalogCsv('sku\n"open'),/Unclosed/);
  assert.match(exportCatalogCsv([{sku:'=CMD()'}],['sku']),/'=CMD/);
});
