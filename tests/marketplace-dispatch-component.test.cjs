const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Vue = require('vue');
const XLSX = require('xlsx');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
(async () => {
    const parser = await import('data:text/javascript;base64,' + fs.readFileSync('src/marketplace-dispatch.js').toString('base64'));
    const descriptor = parse(fs.readFileSync('src/components/MarketplaceOrderDispatch.vue', 'utf8')).descriptor;
    const compiled = compileScript(descriptor, { id: 'dispatch-test' }).content;
    assert.equal(compileTemplate({ id: 'dispatch-test', source: descriptor.template.content, filename: 'MarketplaceOrderDispatch.vue' }).errors.length, 0);
    const storage = new Map();
    function harness(platform, { recorded = new Set(), userId = 'owner', day = '2026-11-18', marketplaces } = {}) {
        const requests = [], completed = [];
        const product = { docId: 'P1', sku: 'Shanum Bw No.6', nama: 'Shanum', warna: 'Bw', varian: 'No.6', hpp: 80000, stokFisik: 1000 };
        const props = Vue.reactive({ userId, platform, products: [product], marketplaces: marketplaces || [{ id: platform + '-shop', name: platform === 'shopee' ? 'Shopee' : 'TikTok Shop' }], subscriptionActive: true });
        let now = day;
        class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now + 'T12:00:00Z'])); } static now() { return new Date(now + 'T12:00:00Z').getTime(); } }
        const context = {
            ...Vue, ...parser, XLSX, Date: Clock, onMounted() {},
            doc: (...args) => args, db: {}, getDoc: async () => ({ exists: () => true, data: () => ({ modelProduk: [] }) }),
            auth: { currentUser: { uid: userId, getIdToken: async () => 'token' } },
            localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
            window: { setTimeout, clearTimeout }, AbortController,
            fetch: async (url, options) => {
                const input = JSON.parse(options.body); requests.push(input);
                assert.equal(input.platform, platform);
                const data = input.action === 'check' ? { alreadyRecorded: input.orderIds.filter(id => recorded.has(id)), uncertain: [] } : {
                    transactions: input.orders.filter(order => !recorded.has(order.orderId)).map(order => ({ id: order.orderId, tanggal: now, tanggalTerkirim: now, shipmentConfirmedAt: now })),
                    stockDeltas: { P1: input.orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.qty, 0), 0) }, stockAfter: { P1: 900 }, duplicateOrders: input.orders.filter(order => recorded.has(order.orderId)).map(order => order.orderId)
                };
                if (input.action === 'confirm') input.orders.forEach(order => recorded.add(order.orderId));
                return { ok: true, json: async () => data };
            }
        };
        vm.createContext(context);
        vm.runInContext(compiled.replace(/^import .*;\n/gm, '').replace('export default', 'globalThis.component ='), context);
        const setup = () => context.component.setup(props, { expose() {}, emit(name, payload) { if (name === 'completed') completed.push(payload); } });
        const first = setup(); first.loadDraft();
        const makeFile = rows => {
            const header = platform === 'shopee' ? ['No. Pesanan', 'Status Pesanan', 'Nomor Referensi SKU', 'Nama Variasi', 'Jumlah'] : ['Order ID', 'Order Status', 'Seller SKU', 'Variation', 'Quantity'];
            const sheet = XLSX.utils.aoa_to_sheet([header, ...rows.map(([id, qty]) => [id, 'Perlu Dikirim', product.sku, 'Bw,No.6', qty])]);
            const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, platform === 'shopee' ? 'orders' : 'OrderSKUList');
            const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' });
            return { name: platform + '-export.xlsx', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
        };
        const upload = (target, rows) => target.handleFile({ target: { files: [makeFile(rows)], value: 'file' } });
        return { first, setup, upload, requests, completed, product, props, recorded, nextDay: () => { now = '2026-11-19'; } };
    }
    for (const platform of ['shopee', 'tiktok']) {
        const h = harness(platform), first = h.first;
        const rows = [['ONEABC', 1], ['TWOABC', 2], ['THREE123', 3]];
        await h.upload(first, rows);
        assert.equal(first.orders.value.length, 3); assert.equal(first.totalQty.value, 6);
        assert(first.orders.value.every(order => !first.isDeferred(order) && first.statusLabel(order) === 'Siap kirim'), 'new orders default to Siap kirim');
        assert(h.requests.every(request => request.action === 'check')); assert.equal(h.product.stokFisik, 1000); assert.equal(h.completed.length, 0);
        first.search.value = 'AbC'; await Vue.nextTick();
        assert.equal(first.suggestions.value.length, 2); first.chooseSuggestion(); assert.equal(first.deferred.value.length, 0, 'ambiguous suffix never chooses automatically');
        first.moveSuggestion(1); first.chooseSuggestion();
        first.search.value = '123'; await Vue.nextTick(); first.chooseSuggestion();
        const heldIds = first.orders.value.filter(first.isDeferred).map(order => order.orderId);
        assert.equal(heldIds.length, 2); assert.equal(first.candidates.value.length, 1);
        // The action selector shows the current status and can change in both directions.
        const held = first.orders.value.find(first.isDeferred);
        first.setShippingStatus(held, 'ready'); assert.equal(first.isDeferred(held), false);
        first.setShippingStatus(held, 'deferred'); assert.equal(first.isDeferred(held), true);
        await first.confirmOrders();
        const confirmations = h.requests.filter(request => request.action === 'confirm');
        assert.equal(confirmations.length, 1); assert.equal(confirmations[0].orders.length, 1);
        assert(!heldIds.includes(confirmations[0].orders[0].orderId));
        assert.equal(first.orders.value.length, 2, 'only the deferred orders stay in the import queue after confirmation');
        assert(first.orders.value.every(first.isDeferred)); assert.equal(first.canConfirm.value, false);
        assert.equal(h.completed.length, 1); assert.equal(h.completed[0].stockDeltas.P1, 2);
        await first.confirmOrders(); assert.equal(h.requests.filter(request => request.action === 'confirm').length, 1);
        h.nextDay(); const restored = h.setup(); restored.loadDraft();
        assert.equal(restored.shipDate.value, '2026-11-19'); assert.equal(restored.orders.value.length, 2);
        await h.upload(restored, rows);
        assert.equal(restored.orders.value.length, 2, 'the next day the same file only leaves unfinished orders');
        assert.equal(restored.totalQty.value, 4); assert(restored.orders.value.every(restored.isDeferred));
        assert.equal(restored.completedHere.value.length, 1);
        restored.setShippingStatus(restored.orders.value[0], 'ready');
        await restored.confirmOrders(); assert.equal(restored.orders.value.length, 1); assert(restored.isDeferred(restored.orders.value[0]));
        const remainingId = restored.orders.value[0].orderId;
        const requestCount = h.requests.length;
        restored.clearDraft();
        assert.equal(restored.orders.value.length, 0); assert.equal(restored.visibleOrders.value.length, 0); assert.equal(restored.fileName.value, '');
        assert.equal(h.requests.length, requestCount, 'reset does not call shipment confirmation or modify stock');
        assert.equal(restored.confirmed.value.length, 2); assert.equal(restored.deferred.value.length, 1);
        // A replacement file is clean; an old file can later recover the remembered hold.
        await h.upload(restored, [['WRONG999', 7]]); assert.equal(restored.orders.value.length, 1);
        restored.clearDraft(); await h.upload(restored, rows);
        assert.equal(restored.orders.value.length, 1); assert.equal(restored.orders.value[0].orderId, remainingId); assert(restored.isDeferred(restored.orders.value[0]));
        await h.upload(restored, [...rows, ['NEW456', 1]]);
        assert.equal(restored.orders.value.length, 2); assert.equal(restored.candidates.value.length, 1); assert.equal(restored.candidates.value[0].orderId, 'NEW456');
        restored.setShippingStatus(restored.orders.value.find(restored.isDeferred), 'ready'); await restored.confirmOrders();
        assert.equal(restored.orders.value.length, 0); assert.match(restored.message.value, /berhasil dikonfirmasi/);
        const allDone = h.setup(); allDone.loadDraft(); await h.upload(allDone, [...rows, ['NEW456', 1]]);
        assert.equal(allDone.orders.value.length, 0); assert.equal(allDone.completedHere.value.length, 4); assert.equal(allDone.canConfirm.value, false); assert.match(allDone.message.value, /4 pesanan sudah dikirim dan dilewati/);
        // A second account with no local history still deduplicates from server records.
        const fresh = harness(platform, { userId: 'fresh-' + platform, recorded: new Set(['ONEABC', 'TWOABC']) });
        await fresh.upload(fresh.first, rows);
        assert.equal(fresh.first.orders.value.length, 1); assert.equal(fresh.first.orders.value[0].orderId, 'THREE123');
        assert.equal(fresh.first.isDeferred(fresh.first.orders.value[0]), false, 'deferred states are isolated per account');
    }
    // Shopee holds cannot change the defaults on TikTok, even when order IDs happen to be equal.
    const isoShopee = harness('shopee', { userId: 'isolation' }); await isoShopee.upload(isoShopee.first, [['SAME123', 1]]); isoShopee.first.setShippingStatus(isoShopee.first.orders.value[0], 'deferred');
    const isoTikTok = harness('tiktok', { userId: 'isolation' }); await isoTikTok.upload(isoTikTok.first, [['SAME123', 1]]); assert.equal(isoTikTok.first.isDeferred(isoTikTok.first.orders.value[0]), false);
    // Clearing confirmed rows during checks must not skip subsequent 200-order chunks.
    const many = Array.from({ length: 205 }, (_, index) => ['BULK' + String(index).padStart(5, '0'), 1]);
    const bulk = harness('shopee', { userId: 'bulk', recorded: new Set(many.map(([id]) => id)) }); await bulk.upload(bulk.first, many);
    assert.equal(bulk.first.orders.value.length, 0); assert.equal(bulk.first.completedHere.value.length, 205); assert.equal(bulk.requests.filter(request => request.action === 'check').length, 2);
    // Delayed settings must not overwrite an existing saved queue before channels arrive.
    const waiting = harness('shopee', { userId: 'isolation', marketplaces: [] });
    assert.equal(waiting.first.orders.value.length, 0);
    waiting.props.marketplaces = [{ id: 'shopee-shop', name: 'Shopee' }]; await Vue.nextTick(); await Vue.nextTick();
    assert.equal(waiting.first.orders.value.length, 1); assert.equal(waiting.first.isDeferred(waiting.first.orders.value[0]), true);
    console.log('PASS: Shopee and TikTok default-ready status selectors, suffix holds, pending-only confirmation/reupload the next day, clean resets without losing status history, server deduplication, account/platform isolation and 205-order chunk checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
