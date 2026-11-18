const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Vue=require('vue'),{parse,compileScript}=require('@vue/compiler-sfc');
const {prepareOrderDeletion,deleteMarketplaceOrder}=require('../server/marketplace-order-delete.cjs');
function harness(){
 const h={rows:new Map([['transactions/TX1',{userId:'owner',marketplaceOrderId:'ORDER001',platform:'shopee',stockDeductionApplied:true,items:[{docId:'P1',sku:'A',qty:2},{docId:'P1',sku:'A',qty:1}]}],['products/P1',{userId:'owner',physical_stock:4,stokFisik:4,sku:'A'}]]),version:1,retry:false,fail:false};
 const ref=path=>({id:path.split('/').at(-1),path});
 const snap=path=>({id:ref(path).id,ref:ref(path),exists:h.rows.has(path),data:()=>structuredClone(h.rows.get(path)),updateTime:'version-'+h.version});
 const query=(name,conditions=[])=>({doc:id=>ref(name+'/'+id),where:(...c)=>query(name,[...conditions,c]),conditions,name});
 const querySnap=q=>({docs:[...h.rows].filter(([path,row])=>path.startsWith(q.name+'/')&&conditionsMatch(q.conditions,row)).map(([path])=>snap(path))});
 const conditionsMatch=(conditions,row)=>conditions.every(([field,,value])=>row[field]===value);
 h.db={collection:name=>query(name),runTransaction:async callback=>{let writes=[];const tx={get:async target=>{assert.equal(writes.length,0,'all reads precede writes');return target.path?snap(target.path):querySnap(target);},update:(target,data)=>writes.push(['update',target.path,data]),set:(target,data)=>writes.push(['set',target.path,data]),delete:target=>writes.push(['delete',target.path])};if(h.retry){await callback(tx);writes=[];h.retry=false;}const result=await callback(tx);if(h.fail)throw Error('commit failed');for(const [kind,path,data]of writes){if(kind==='delete')h.rows.delete(path);else h.rows.set(path,kind==='update'?{...h.rows.get(path),...data}:data);}return result;}};
 h.prepare=(userId='owner')=>prepareOrderDeletion({db:h.db,userId,input:{transactionId:'TX1'}});
 h.delete=(prepared,userId='owner',steps=2)=>deleteMarketplaceOrder({db:h.db,userId,input:{transactionId:'TX1',fingerprint:prepared.fingerprint,confirmationSteps:steps}});
 return h;
}
(async()=>{
 const h=harness(),initial=JSON.stringify([...h.rows]);const prepared=await h.prepare();assert.equal(prepared.restoreQty,3);assert.equal(JSON.stringify([...h.rows]),initial,'preparing second confirmation is read only');
 await assert.rejects(h.delete(prepared,'owner',1),e=>e.status===400);assert.equal(JSON.stringify([...h.rows]),initial);
 h.retry=true;const result=await h.delete(prepared);assert.equal(h.rows.has('transactions/TX1'),false);assert.equal(h.rows.get('products/P1').physical_stock,7);assert.equal(h.rows.get('products/P1').stokFisik,7);assert.equal(result.stockAfter.P1,7);assert.equal([...h.rows].filter(([p])=>p.startsWith('marketplace_order_deletions/')).length,1);
 h.rows.get('products/P1').physical_stock=9;const repeated=await h.delete(prepared);assert.equal(repeated.alreadyDeleted,true);assert.equal(h.rows.get('products/P1').physical_stock,9);assert.deepEqual(repeated.stockAfter,{},'retry must not return old stock values');
 h.rows.set('transactions/TX1',{userId:'owner',marketplaceOrderId:'ORDER001',stockDeductionApplied:true,items:[{docId:'P1',qty:1}]});await assert.rejects(h.delete(prepared),e=>e.status===409);assert(h.rows.has('transactions/TX1'),'a stale retry cannot hide or delete a reimported order');assert.equal(h.rows.get('products/P1').physical_stock,9);
 const stale=harness();const original=await stale.prepare();stale.version++;await assert.rejects(stale.delete(original),e=>e.status===409);assert(stale.rows.has('transactions/TX1'));
 const foreign=harness();await assert.rejects(foreign.prepare('other'),e=>e.status===403);const own=await foreign.prepare();await assert.rejects(foreign.delete(own,'other'),e=>e.status===403);
 const missing=harness();const m=await missing.prepare();missing.rows.delete('products/P1');await assert.rejects(missing.delete(m),e=>e.status===409);assert(missing.rows.has('transactions/TX1'));
 const failed=harness();const f=await failed.prepare();failed.fail=true;await assert.rejects(failed.delete(f),/commit failed/);assert(failed.rows.has('transactions/TX1'));assert.equal(failed.rows.get('products/P1').physical_stock,4);
 const linked=harness();linked.rows.set('returns/R1',{userId:'owner',originalTransactionId:'TX1'});await assert.rejects(linked.prepare(),e=>e.status===409);assert.equal(linked.rows.get('products/P1').physical_stock,4);
 const notDeducted=harness();notDeducted.rows.get('transactions/TX1').stockDeductionApplied=false;const nd=await notDeducted.prepare();assert.equal(nd.restoreQty,0);await notDeducted.delete(nd);assert.equal(notDeducted.rows.get('products/P1').physical_stock,4);
 const returned=harness();returned.rows.get('transactions/TX1').returnCompleted=true;const rp=await returned.prepare();assert.equal(rp.restoreQty,0);await returned.delete(rp);assert.equal(returned.rows.get('products/P1').physical_stock,4,'deleting a returned order cannot return stock twice after history is removed');
 const descriptor=parse(fs.readFileSync('src/components/MarketplaceTransactionHistory.vue','utf8')).descriptor;const compiled=compileScript(descriptor,{id:'delete-test'}).content;
 for(const choices of [[false],[true,false],[true,true]]){
  const prompts=[],calls=[],events=[],storage=new Map();storage.set('fashion-os-dispatch-v2:owner:shopee',JSON.stringify({userId:'owner',platform:'shopee',orders:[],confirmed:['order001','other'],completedHere:['order001'],deferred:[]}));
  const ctx={...Vue,auth:{currentUser:{uid:'owner',getIdToken:async()=> 'token'}},window:{confirm:message=>{prompts.push(message);return choices[prompts.length-1];}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return{ok:true,json:async()=>body.action==='prepare_delete'?{...prepared,orderId:'ORDER001'}:result};}};
  vm.createContext(ctx);vm.runInContext(compiled.replace(/^import .*;\n/gm,'').replace('export default','globalThis.component='),ctx);
  const tx={id:'TX1',marketplaceOrderId:'ORDER001',items:[{qty:3,hpp:1}]};const component=ctx.component.setup({userId:'owner',transactions:[tx],marketplaces:[]},{expose(){},emit:(...args)=>events.push(args)});
  await component.deleteOrder(tx);assert.equal(prompts.length,choices.length);assert.equal(calls.filter(c=>c.action==='delete').length,choices.every(Boolean)?1:0);assert.equal(events.length,choices.every(Boolean)?1:0);
  if(choices.every(Boolean)){assert.equal(component.filtered.value.length,0);const draft=JSON.parse(storage.get('fashion-os-dispatch-v2:owner:shopee'));assert.deepEqual(draft.confirmed,['other']);assert.equal(calls[1].confirmationSteps,2);}
  else assert.equal(component.filtered.value.length,1);
 }
 console.log('PASS: two confirmations and both cancellation paths; atomic deletion and fresh stock restoration; repeat/retry safety; changed-order rejection; ownership, missing product and linked-return protection; local import history reset.');
})().catch(error=>{console.error(error);process.exitCode=1;});
