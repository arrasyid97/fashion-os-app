const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Vue = require('vue');
const XLSX = require('xlsx');
const { parse, compileScript } = require('@vue/compiler-sfc');
(async () => {
    const parser = await import('data:text/javascript;base64,' + fs.readFileSync('src/marketplace-dispatch.js').toString('base64'));
    const compiled = compileScript(parse(fs.readFileSync('src/components/MarketplaceOrderDispatch.vue', 'utf8')).descriptor, { id: 'dispatch-test' }).content;
    const storage = new Map(), requests = [], completed = [], recorded = new Set();
    const product = { docId: 'P1', sku: 'Shanum Bw No.6', nama: 'Shanum', warna: 'Bw', varian: 'No.6', hpp: 80000, stokFisik: 10 };
    const props = Vue.reactive({ userId: 'owner', platform: 'shopee', products: [product], marketplaces: [{ id: 'shop', name: 'Shopee' }], subscriptionActive: true });
    const context = {
        ...Vue, ...parser, XLSX, onMounted() {},
        doc: (...args) => args, db: {}, getDoc: async () => ({ exists: () => true, data: () => ({ modelProduk: [] }) }),
        auth: { currentUser: { uid: 'owner', getIdToken: async () => 'token' } },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        window: { setTimeout, clearTimeout, confirm: () => true }, AbortController,
        fetch: async (url, options) => {
            const input = JSON.parse(options.body); requests.push(input);
            const data = input.action === 'check' ? { alreadyRecorded: input.orderIds.filter(id => recorded.has(id)), uncertain: [] } : {
                transactions: input.orders.filter(order => !recorded.has(order.orderId)).map(order => ({ id: order.orderId, tanggal: '2026-11-18', tanggalTerkirim: '2026-11-18', shipmentConfirmedAt: '2026-11-18' })),
                stockDeltas: { P1: 1 }, stockAfter: { P1: 9 }, duplicateOrders: input.orders.filter(order => recorded.has(order.orderId)).map(order => order.orderId)
            };
            if (input.action === 'confirm') input.orders.forEach(order => recorded.add(order.orderId));
            return { ok: true, json: async () => data };
        }
    };
    vm.createContext(context);
    vm.runInContext(compiled.replace(/^import .*;\n/gm, '').replace('export default', 'globalThis.component ='), context);
    const setup = () => context.component.setup(props, { expose() {}, emit(name, payload) { if (name === 'completed') completed.push(payload); } });
    const first = setup(); first.loadDraft();
    const sheet = XLSX.utils.aoa_to_sheet([
        ['No. Pesanan', 'Status Pesanan', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah'],
        ['ONEABC', 'Perlu Dikirim', product.sku, 'Bw,No.6', 1],
        ['TWOABC', 'Perlu Dikirim', product.sku, 'Bw,No.6', 2],
        ['THREE123', 'Perlu Dikirim', product.sku, 'Bw,No.6', 3]
    ]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'orders');
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' });
    const upload = target => target.handleFile({ target: { files: [{ name: 'Order.toship.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }], value: 'file' } });
    await upload(first);
    assert.equal(first.orders.value.length, 3); assert.equal(first.totalQty.value, 6);
    assert(requests.every(request => request.action === 'check'), 'upload only inspects existing orders');
    assert.equal(product.stokFisik, 10); assert.equal(completed.length, 0);
    first.search.value = 'AbC'; await Vue.nextTick();
    assert.equal(first.suggestions.value.length, 2); first.chooseSuggestion(); assert.equal(first.deferred.value.length, 0, 'ambiguous suffix never chooses an order automatically');
    first.moveSuggestion(1); first.chooseSuggestion(); assert.equal(first.deferred.value.length, 1);
    first.search.value = '123'; await Vue.nextTick(); first.chooseSuggestion(); assert.equal(first.deferred.value.length, 2);
    const heldIds = first.orders.value.filter(first.isDeferred).map(order => order.orderId);
    assert.equal(first.candidates.value.length, 1); assert.equal(first.canConfirm.value, true);
    await first.confirmOrders();
    const confirmations = requests.filter(request => request.action === 'confirm');
    assert.equal(confirmations.length, 1); assert.equal(confirmations[0].orders.length, 1);
    assert(!heldIds.includes(confirmations[0].orders[0].orderId), 'deferred orders never reach confirmation API');
    assert.equal(completed.length, 1); assert.equal(first.canConfirm.value, false);
    await first.confirmOrders(); assert.equal(requests.filter(request => request.action === 'confirm').length, 1);
    const restored = setup(); restored.loadDraft();
    assert.equal(restored.deferred.value.length, 2); assert.equal(restored.confirmed.value.length, 1);
    await upload(restored);
    assert.equal(restored.orders.value.length, 3, 'uploading the same export merges orders instead of adding quantities');
    assert.equal(restored.totalQty.value, 6); assert.equal(restored.deferred.value.length, 2);
    restored.restoreOrder(restored.orders.value.find(order => order.orderId === heldIds[0]));
    assert.equal(restored.candidates.value.length, 1, 'a deferred order can be confirmed later');
    console.log('PASS: real Vue component upload, ambiguous and unique suffix search, deferred exclusion, explicit confirmation, repeated clicks, persisted holds and duplicate file uploads.');
})().catch(error => { console.error(error); process.exitCode = 1; });
