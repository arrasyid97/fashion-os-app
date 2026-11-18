const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const {confirmDispatchBatch,inspectDispatchOrders,transactionId}=require('../server/marketplace-dispatch.cjs');
function harness(){
 const h={records:new Map([
  ['settings/owner',{marketplaces:[{id:'shop',name:'Shopee'},{id:'tt',name:'TikTok Shop'}],modelProduk:[]}],
  ['products/P1',{userId:'owner',sku:'FO-P1',product_name:'Shanum',color:'Bw',variant:'No.6',hpp:80000,physical_stock:5,stokFisik:5}],
  ['products/P2',{userId:'owner',sku:'FO-P2',product_name:'Shanum',color:'Mahogany',variant:'M',hpp:90000,physical_stock:7}]
 ]),fail:false,retry:false};
 const ref=path=>({id:path.split('/').at(-1),path,get:async()=>snap(path)});
 const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:h.records.has(path),data:()=>structuredClone(h.records.get(path))});
 const query=(path,conditions=[])=>({query:true,path,conditions,doc:id=>ref(path+'/'+id),where:(...condition)=>query(path,[...conditions,condition]),get:async()=>({docs:[...h.records].filter(([p,row])=>p.startsWith(path+'/')&&p.split('/').length===2&&conditions.every(([field,op,value])=>op==='=='?row[field]===value:value.includes(row[field]))).map(([p])=>snap(p))})});
 h.db={collection:name=>query(name),runTransaction:async callback=>{
  let writes=[];const tx={get:async target=>{assert.equal(writes.length,0,'reads must precede writes');return target.query?target.get():snap(target.path);},set:(target,row)=>writes.push({target,row,update:false}),update:(target,row)=>writes.push({target,row,update:true})};
  if(h.retry){await callback(tx);writes=[];h.retry=false;}const result=await callback(tx);if(h.fail)throw new Error('commit rejected');
  writes.forEach(w=>assert(!w.update||h.records.has(w.target.path)));writes.forEach(w=>h.records.set(w.target.path,w.update?{...h.records.get(w.target.path),...w.row}:structuredClone(w.row)));return result;
 }};
 h.input={platform:'shopee',channelId:'shop',shipDate:'2026-11-18',batchId:'B1',sourceFileName:'export.xlsx',orders:[{orderId:'ORDER001',trackingNumbers:['RESI1'],items:[{productId:'P1',qty:2,hpp:1}]},{orderId:'ORDER002',items:[{productId:'P1',qty:1}]}]};
 h.confirm=(input=h.input,userId='owner')=>confirmDispatchBatch({db:h.db,userId,input});
 h.inspect=(orderIds=['ORDER001','ORDER002'])=>inspectDispatchOrders({db:h.db,userId:'owner',input:{platform:'shopee',channelId:'shop',orderIds}});
 return h;
}
(async()=>{
 const h=harness();const before=JSON.stringify([...h.records]);assert.deepEqual(await h.inspect(),{alreadyRecorded:[],uncertain:[]});assert.equal(JSON.stringify([...h.records]),before,'upload inspection is read only');
 h.retry=true;const first=await h.confirm();assert.equal(first.transactions.length,2);assert.equal(first.transactions[0].items[0].hpp,80000,'HPP comes from server');assert.equal(first.transactions[0].totalHpp,160000);assert.equal(first.stockAfter.P1,2);assert.equal(h.records.get('products/P1').physical_stock,2);assert.equal(h.records.get('products/P1').stokFisik,2);assert.equal(h.records.get('products/P2').physical_stock,7,'unselected/deferred product untouched');
 assert.equal(first.transactions[0].statusPencairan,'Belum Cair');assert.equal(first.transactions[0].shipmentConfirmed,true);
 const repeat=await h.confirm();assert.equal(repeat.transactions.length,0);assert.equal(repeat.duplicateOrders.length,2);assert.equal(h.records.get('products/P1').physical_stock,2,'repeat confirmation never debits stock again');
 assert.equal((await h.inspect()).alreadyRecorded.length,2);
 const snapshot=JSON.stringify([...h.records]);await assert.rejects(h.confirm({...h.input,orders:[{orderId:'ORDER003',items:[{productId:'P1',qty:1}]},{orderId:'ORDER004',items:[{productId:'P2',qty:99}]}]}),e=>e.code==='stock_shortage');assert.equal(JSON.stringify([...h.records]),snapshot,'shortage commits no partial order or stock');
 const rejected=harness();rejected.fail=true;const failedBefore=JSON.stringify([...rejected.records]);await assert.rejects(rejected.confirm(),/commit rejected/);assert.equal(JSON.stringify([...rejected.records]),failedBefore);
 const old=harness();old.records.set('transactions/legacy',{userId:'owner',channel:'Shopee',marketplaceOrderId:'ORDER001',items:[{sku:'FO-P1',qty:2}],stockDeductionApplied:true});const legacyResult=await old.confirm();assert.deepEqual(legacyResult.duplicateOrders,['ORDER001']);assert.equal(old.records.get('products/P1').physical_stock,4);
 const uncertain=harness();uncertain.records.set('transactions/legacy',{userId:'owner',channel:'Shopee',marketplaceOrderId:'ORDER001',stockDeductionApplied:false});await assert.rejects(uncertain.confirm(),e=>e.code==='legacy_stock_uncertain');assert.equal(uncertain.records.get('products/P1').physical_stock,5);assert.equal((await uncertain.inspect()).uncertain.length,1);
 const foreign=harness();foreign.records.get('products/P1').userId='other';await assert.rejects(foreign.confirm(),e=>e.status===403);assert.equal(foreign.records.get('products/P1').physical_stock,5);
 const invalid=harness();await assert.rejects(invalid.confirm({...invalid.input,orders:[{orderId:'BAD',items:[{productId:'P1',qty:-1}]}]}),e=>e.status===400);assert.equal(invalid.records.get('products/P1').physical_stock,5);
 const badDate=harness();await assert.rejects(badDate.confirm({...badDate.input,shipDate:'2026-02-30'}),e=>e.status===400);
 assert.equal(transactionId('owner','shopee','ABC'),transactionId('owner','shopee','abc'));assert.notEqual(transactionId('owner','shopee','ABC'),transactionId('owner','tiktok','ABC'));assert.notEqual(transactionId('owner','shopee','ABC'),transactionId('other','shopee','ABC'));
 const context={module:{exports:{}},process:{env:{}},console:{error:()=>{}},require:name=>name==='firebase-admin'?{apps:[{name:'marketplace-dispatch',auth:()=>({verifyIdToken:async token=>{if(token!=='good')throw new Error('bad token');return {uid:'owner'};}}),firestore:()=>({})}]}:{confirmDispatchBatch:async args=>({owner:args.userId}),inspectDispatchOrders:async()=>({alreadyRecorded:[],uncertain:[]})}};
 vm.runInNewContext(fs.readFileSync('api/confirm-marketplace-dispatch.js','utf8'),context);
 const request=async(method,token,body={action:'confirm',userId:'other'})=>{const response={code:200,setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await context.module.exports({method,headers:token?{authorization:'Bearer '+token}:{},body},response);return response;};
 assert.equal((await request('GET')).code,405);assert.equal((await request('POST')).code,401);assert.equal((await request('POST','bad')).code,401);assert.equal((await request('POST','good')).data.owner,'owner','caller cannot override token owner');
 console.log('PASS: read-only staging, fresh stock and HPP, deferred exclusion, atomic commit/rejection, retries/duplicate imports, legacy records, ownership, dates and API authentication.');
})().catch(error=>{console.error(error);process.exitCode=1;});
