const assert = require('node:assert/strict');
const fs = require('node:fs');
const XLSX = require('xlsx');
(async () => {
 const m = await import('data:text/javascript;base64,' + fs.readFileSync('src/marketplace-dispatch.js').toString('base64'));
 const root = process.env.DISPATCH_FIXTURE_DIR;
 const cases = [
  ['shopee','Order.toship.20261015_20261114.xlsx',43,54,56,0],
  ['tiktok','Untuk Dikirim pesanan-2026-11-14-17_29.xlsx',2,2,2,1]
 ];
 if (root) for (const [platform, file, count, rowCount, qty, skipped] of cases) {
  const book = XLSX.readFile(root+'/'+file,{cellDates:true});
  const sheets = m.findDispatchSheets(book,XLSX,platform); assert.equal(sheets.length,1);
  const parsed = m.parseDispatchSheet(sheets[0],platform);
  assert.equal(parsed.orders.length,count); assert.equal(parsed.sourceRows,rowCount); assert.equal(parsed.qty,qty); assert.equal(parsed.descriptionsSkipped,skipped); assert.equal(parsed.warnings.length,0);
  assert(parsed.orders.every(order=>!order.excludedReason&&order.items.every(item=>item.qty>0)));
  if(platform==='tiktok')assert(parsed.orders.every(order=>order.orderId.length>16 && /^\d+$/.test(order.orderId)));
  const unique = new Map();parsed.orders.forEach(order=>order.items.forEach(item=>{ if(!unique.has(item.sellerSku))unique.set(item.sellerSku,{docId:'p'+unique.size,sku:'FO-'+unique.size,nama:item.sellerSku,warna:item.color,varian:item.size,hpp:80000,stokFisik:100}); }));
  const products = [...unique.values()];const resolved=m.resolveDispatchOrders(parsed.orders,products);
  assert(resolved.every(order=>!order.issues.length));assert.equal(resolved.reduce((sum,order)=>sum+order.qty,0),qty);
  const deferred = new Set([resolved[0].key]);const candidates=resolved.filter(order=>!deferred.has(order.key));
  assert.equal(candidates.length,count-1);assert.equal(m.dispatchStockNeeds(candidates).reduce((sum,item)=>sum+item.qty,0),qty-resolved[0].qty);
  assert.throws(()=>m.findDispatchSheets(book,XLSX,platform==='shopee'?'tiktok':'shopee'),/format/);
 }
 const orders=[{orderId:'SHOP-100ABC',trackingNumbers:['RESI001']},{orderId:'SHOP-200ABC',trackingNumbers:[]},{orderId:'ABC-START',trackingNumbers:[]}];
 assert.equal(m.searchDispatchOrders(orders,'AbC').length,2);assert.equal(m.searchDispatchOrders(orders,'AB').length,0);assert.equal(m.searchDispatchOrders(orders,'RESI001').length,1);assert.equal(m.searchDispatchOrders(orders,'SHOP-200ABC')[0].orderId,'SHOP-200ABC');
 const variants=[{docId:'s1',nama:'Shanum',warna:'Hitam',varian:'No.1',hpp:1},{docId:'s10',nama:'Shanum',warna:'Hitam',varian:'No.10',hpp:1}];
 const item={sellerSku:'Shanum Hitam No.10',color:'BLACK',size:'no.10 (9-10 tahun)'};
 assert.equal(m.matchDispatchProduct(item,variants).id,'s10');assert.equal(m.matchDispatchProduct(item,[...variants,{...variants[1],docId:'duplicate'}]),null);
 assert.equal(m.dispatchColor('Broken White'),m.dispatchColor('Bw'));assert.equal(m.dispatchColor('Rosy Brown'),m.dispatchColor('Rosybrown'));assert.notEqual(m.dispatchSize('No.1'),m.dispatchSize('No.10'));
 const badSheet={headerIndex:0,columns:{orderId:0,status:1,sku:2,qty:3,variation:4},table:[[],['ORDER001','Perlu Dikirim','SKU',0,'Black,M'],['ORDER002','Dibatalkan','SKU',1,'Black,M'],[1234567890123456789,'Perlu Dikirim','SKU',1,'Black,M']]};
 const bad=m.parseDispatchSheet(badSheet,'shopee');assert.equal(bad.orders[0].items[0].issues.length,1);assert(bad.orders[1].excludedReason);assert.equal(bad.warnings.length,1);
 const headers={orderId:0,status:1,sku:2,qty:3,variation:4};
 const lineA=['ORDER123','Perlu Dikirim','Shanum Hitam No.1',1,'Hitam,No.1'],lineB=['ORDER123','Perlu Dikirim','Shanum Hitam No.10',1,'Hitam,No.10'];
 const original=m.parseDispatchSheet({headerIndex:0,columns:headers,table:[[],lineA,lineB]},'shopee').orders;
 const reordered=m.parseDispatchSheet({headerIndex:0,columns:headers,table:[[],lineB,lineA]},'shopee').orders;
 assert.equal(original[0].items[0].key,reordered[0].items[1].key,'item identity survives reordered export rows');
 const overrideKey=original[0].key+':'+original[0].items[0].key;
 const remapped=m.resolveDispatchOrders(reordered,variants,[],{[overrideKey]:'s1'});
 assert.deepEqual(remapped[0].items.map(item=>item.product.id),['s10','s1'],'saved manual mapping never migrates to another SKU after reupload');
 const component=fs.readFileSync('src/components/MarketplaceOrderDispatch.vue','utf8');
 const upload=component.slice(component.indexOf('async function handleFile'),component.indexOf('function deferOrder'));
 assert(!/increment\(|writeBatch\(|addDoc\(|updateDoc\(/.test(upload));assert(!upload.includes("action: 'confirm'"));
 console.log('PASS: ' + (root ? 'real Shopee (43 orders / 56 pcs) and TikTok (2 orders / 2 pcs) exports; ' : '') + ' description rows, exact IDs, correct qty columns, deferred exclusion, SKU dimensions, suffix collisions, wrong-file rejection and upload-only staging.');
})().catch(error=>{console.error(error);process.exitCode=1;});
