const bad=message=>Object.assign(new Error(message),{status:400});
const clean=value=>String(value??'').trim();
const code=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
export function attributeSignature(attributes) {
  return JSON.stringify(Object.entries(attributes).map(([key,value])=>[clean(key),clean(value)]).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
/** Pure preview: no catalog rows exist until the merchant selects and confirms. */
export function previewVariantMatrix({prefix,axes,price=0,sku_style='sequence'}) {
  if(!code(prefix)||code(prefix).length>40)throw bad('Choose a SKU prefix of up to 40 characters');
  if(!Array.isArray(axes)||!axes.length||axes.length>6)throw bad('Choose between one and six attributes');
  const names=new Set();let combinations=[{}];
  for(const axis of axes){
    const name=clean(axis.name);
    if(!name||names.has(name)||!Array.isArray(axis.values)||!axis.values.length)throw bad('Each attribute needs a unique name and values');
    names.add(name);const values=axis.values.map(clean);
    if(new Set(values).size!==values.length||values.some(v=>!v||v.length>120))throw bad(`Duplicate or empty ${name} values`);
    if(combinations.length*values.length>1000)throw bad('Preview at most 1000 combinations at a time');
    combinations=combinations.flatMap(row=>values.map(value=>({...row,[name]:value})));
  }
  const amount=Number(price);if(!Number.isFinite(amount)||amount<0)throw bad('Invalid retail price');
  const used=new Set();
  return combinations.map((attributes,index)=>{
    let sku=sku_style==='attributes'?`${code(prefix)}-${axes.map(axis=>code(axis.codes?.[attributes[axis.name]]||attributes[axis.name]).slice(0,12)).join('-')}`.slice(0,94):`${code(prefix)}-${String(index+1).padStart(4,'0')}`;
    if(used.has(sku))sku=`${sku}-${index+1}`;used.add(sku);
    return {selected:true,attributes,merchandising_signature:attributeSignature(attributes),variant_name:Object.values(attributes).join(' / '),sku,price:amount,tracking_mode:'none',merchandising_active:1,barcodes:[]};
  });
}

/** RFC-style quoted fields, including embedded newlines; hard limits before parsing. */
export function parseCatalogCsv(source) {
  if(typeof source!=='string'||source.length>2_000_000)throw bad('CSV must be smaller than 2 MB');
  const rows=[];let row=[],value='',quoted=false,closed=false;
  const field=()=>{row.push(value);value='';closed=false;};
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){if(char==='"'){if(source[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=char;continue;}
    if(char==='"'){if(value||closed)throw bad('Invalid CSV quote');quoted=true;continue;}
    if(char===','){field();continue;}
    if(char==='\r'||char==='\n'){if(char==='\r'&&source[i+1]==='\n')i++;field();if(row.some(Boolean))rows.push(row);row=[];if(rows.length>1001)throw bad('Import at most 1000 rows');continue;}
    if(closed)throw bad('Unexpected text after CSV quote');value+=char;
  }
  if(quoted)throw bad('Unclosed CSV quote');field();if(row.some(Boolean))rows.push(row);
  if(rows.length<2||rows.length>1001)throw bad('CSV needs a header and between 1 and 1000 data rows');
  const headers=rows.shift().map(v=>v.replace(/^\uFEFF/,'').trim());
  if(new Set(headers).size!==headers.length||headers.some(v=>!v))throw bad('CSV headers must be unique and nonempty');
  return rows.map((values,index)=>{if(values.length!==headers.length)throw bad(`CSV row ${index+2} has ${values.length} columns; expected ${headers.length}`);return Object.fromEntries(headers.map((key,i)=>[key,values[i]]));});
}
/** Bulk product upload layout. Rows sharing a name become one product with colour/size versions. */
export const PRODUCT_CSV_COLUMNS=['name','category','brand','price','mrp','barcode','sku','colour','size','wholesale_price','description'];
export const PRODUCT_CSV_SAMPLE=[
  PRODUCT_CSV_COLUMNS.join(','),
  'Bunny hair clip,Hair accessories,Kawaii,150,180,,,Pink,,120,Soft velvet clip',
  'Bunny hair clip,Hair accessories,Kawaii,150,180,,,Black,,120,Soft velvet clip',
  'Cotton kurta,Clothing,,1200,1500,,,Blue,M,1000,',
  'Cotton kurta,Clothing,,1200,1500,,,Blue,L,1000,',
  'Cotton kurta,Clothing,,1250,1500,,,Blue,XL,1050,',
  'Steel water bottle,Kitchen,Milton,650,700,,BOTTLE-1L,,,,"1 litre, keeps water cold"',
].join('\r\n');
export function exportCatalogCsv(rows,columns) {
  const cell=value=>{let text=Array.isArray(value)?value.join('|'):String(value??'');if(/^[=+@\t\r]/.test(text)||/^-(?!\d+(?:\.\d+)?$)/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
  return [columns,...rows.map(row=>columns.map(column=>row[column]))].map(row=>row.map(cell).join(',')).join('\r\n');
}
