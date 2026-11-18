const { createHash } = require('node:crypto');
const text = value => String(value ?? '').trim();
const key = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const platformOf = value => /shopee/i.test(value || '') ? 'shopee' : /tiktok|tokopedia/i.test(value || '') ? 'tiktok' : '';
function fail(status, message, code = 'invalid_dispatch', extra = {}) { const error = new Error(message); Object.assign(error, { status, code, ...extra }); throw error; }
function transactionId(uid, platform, orderId) { return 'DISPATCH-' + createHash('sha256').update(JSON.stringify([uid, platform, key(orderId)])).digest('hex'); }

async function confirmDispatchBatch({ db, userId, input, now = new Date() }) {
    const platform = input?.platform;
    const channelId = text(input?.channelId);
    const shipDate = text(input?.shipDate);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(shipDate) ? new Date(shipDate + 'T12:00:00+07:00') : null;
    if (!userId || !['shopee', 'tiktok'].includes(platform) || !channelId || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== shipDate) fail(400, 'Marketplace dan tanggal pengiriman harus diisi dengan benar.');
    if (!Array.isArray(input.orders) || !input.orders.length || input.orders.length > 20) fail(400, 'Konfirmasi maksimal 20 pesanan per proses.');
    const orders = input.orders.map(order => {
        const orderId = text(order.orderId);
        if (!orderId || orderId.length > 120 || !/^[a-z0-9_-]+$/i.test(orderId)) fail(400, 'ID pesanan tidak valid.');
        if (!Array.isArray(order.items) || !order.items.length || order.items.length > 200) fail(400, 'Rincian produk pesanan tidak lengkap.');
        const items = order.items.map(item => {
            const productId = text(item.productId);
            if (!productId || !/^[a-z0-9_-]{1,128}$/i.test(productId) || !Number.isSafeInteger(item.qty) || item.qty <= 0 || item.qty > 1000000) fail(400, 'Produk dan jumlah pcs tidak valid.');
            return { productId, qty: item.qty, platformSellerSku: text(item.platformSellerSku).slice(0, 250), platformSkuId: text(item.platformSkuId).slice(0, 100), variasiEkspor: text(item.variasiEkspor).slice(0, 300) };
        });
        const list = value => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))].slice(0, 100) : [];
        return { orderId, items, packageIds: list(order.packageIds), trackingNumbers: list(order.trackingNumbers) };
    });
    if (new Set(orders.map(order => key(order.orderId))).size !== orders.length) fail(400, 'ID pesanan ganda dalam konfirmasi yang sama.');
    const allProductIds = [...new Set(orders.flatMap(order => order.items.map(item => item.productId)))];
    if (allProductIds.length > 350) fail(400, 'Terlalu banyak variasi dalam satu proses. Konfirmasikan dalam kelompok lebih kecil.');
    const idsForLegacy = [...new Set(orders.flatMap(order => [order.orderId, order.orderId.toUpperCase(), order.orderId.toLowerCase()]))];
    const transactionRefs = orders.map(order => db.collection('transactions').doc(transactionId(userId, platform, order.orderId)));
    const productRefs = allProductIds.map(id => db.collection('products').doc(id));
    return db.runTransaction(async transaction => {
        const settingsSnap = await transaction.get(db.collection('settings').doc(userId));
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const channel = (settings.marketplaces || []).find(item => String(item.id) === channelId && platformOf(item.name) === platform);
        if (!channel) fail(400, 'Marketplace ' + platform + ' belum sesuai dengan Pengaturan akun ini.');
        const old = [];
        for (let offset = 0; offset < idsForLegacy.length; offset += 30) {
            const query = db.collection('transactions').where('userId', '==', userId).where('marketplaceOrderId', 'in', idsForLegacy.slice(offset, offset + 30));
            const snapshot = await transaction.get(query);
            snapshot.docs.forEach(doc => old.push({ ...doc.data(), id: doc.id }));
        }
        const existingSnapshots = await Promise.all(transactionRefs.map(ref => transaction.get(ref)));
        const duplicates = [];
        const newOrders = [];
        orders.forEach((order, index) => {
            const canonical = existingSnapshots[index];
            if (canonical.exists && canonical.data().userId !== userId) fail(403, 'Transaksi bukan milik akun ini.');
            const matches = old.filter(record => key(record.marketplaceOrderId) === key(order.orderId) &&
                (String(record.channelId) === channelId || platformOf(record.platform || record.channel) === platform));
            const unknown = old.some(record => key(record.marketplaceOrderId) === key(order.orderId) && !platformOf(record.platform || record.channel) && String(record.channelId) !== channelId);
            if (unknown && !canonical.exists && !matches.length) fail(409, 'ID ' + order.orderId + ' sudah ada pada transaksi lama yang marketplace-nya belum jelas. Periksa Riwayat Transaksi.', 'legacy_order_ambiguous', { orderId: order.orderId });
            if (canonical.exists || matches.length) {
                if (matches.some(record => record.stockDeductionApplied === false)) fail(409, 'Pesanan ' + order.orderId + ' sudah ada tetapi pengurangan stoknya belum pasti. Periksa Riwayat Transaksi.', 'legacy_stock_uncertain', { orderId: order.orderId });
                duplicates.push(order.orderId); return;
            }
            newOrders.push({ ...order, transactionRef: transactionRefs[index] });
        });
        const productsNeeded = new Set(newOrders.flatMap(order => order.items.map(item => item.productId)));
        const snapshots = await Promise.all(productRefs.filter(ref => productsNeeded.has(ref.id)).map(ref => transaction.get(ref)));
        const products = new Map();
        snapshots.forEach(snap => {
            const product = snap.data();
            if (!snap.exists || product.userId !== userId) fail(403, 'Produk tidak ditemukan atau bukan milik akun ini.');
            const hpp = Number(product.hpp);
            const stock = Number(product.physical_stock ?? product.stokFisik);
            if (!Number.isFinite(hpp) || hpp <= 0 || !Number.isSafeInteger(stock)) fail(409, 'HPP atau stok ' + (product.product_name || product.sku || snap.id) + ' belum valid.', 'product_not_ready');
            products.set(snap.id, { ...product, hpp, stock, ref: snap.ref });
        });
        const needs = new Map();
        newOrders.forEach(order => order.items.forEach(item => needs.set(item.productId, (needs.get(item.productId) || 0) + item.qty)));
        const shortages = [...needs].filter(([id, qty]) => products.get(id).stock < qty).map(([id, qty]) => ({ productId: id, name: products.get(id).product_name || products.get(id).sku || id, stock: products.get(id).stock, requested: qty }));
        if (shortages.length) fail(409, 'Stok terbaru belum cukup. Tambahkan stok atau tunda pesanan terkait sebelum konfirmasi.', 'stock_shortage', { shortages });
        const saved = newOrders.map(order => {
            const merged = new Map();
            order.items.forEach(item => {
                const p = products.get(item.productId);
                const model = (settings.modelProduk || []).find(model => String(model.id) === String(p.model_id || p.modelId));
                if (merged.has(item.productId)) { merged.get(item.productId).qty += item.qty; return; }
                merged.set(item.productId, { docId: item.productId, sku: p.sku || item.platformSellerSku, qty: item.qty, hpp: p.hpp,
                    nama: model?.namaModel || p.product_name || p.nama || p.sku || '', warna: p.color || p.warna || model?.warna || '',
                    ukuran: p.variant || p.varian || p.ukuran || model?.ukuran || '', varian: p.variant || p.varian || p.ukuran || model?.ukuran || '',
                    model_id: p.model_id || p.modelId || '', platformSellerSku: item.platformSellerSku, platformSkuId: item.platformSkuId, variasiEkspor: item.variasiEkspor });
            });
            const items = [...merged.values()];
            const totalHpp = items.reduce((sum, item) => sum + item.hpp * item.qty, 0);
            if (!Number.isFinite(totalHpp) || totalHpp > Number.MAX_SAFE_INTEGER) fail(400, 'Total HPP pesanan melewati batas angka.');
            return { id: order.transactionRef.id, userId, platform, channelId, channel: channel.name,
                marketplaceOrderId: order.orderId, externalPackageId: order.packageIds[0] || '', externalPackageIds: order.packageIds,
                trackingNumber: order.trackingNumbers[0] || '', trackingNumbers: order.trackingNumbers,
                tanggal: date, tanggalTerkirim: date, inputSource: 'marketplace_shipped_export', confirmationSource: 'pending_export_manual_confirmation',
                shipmentConfirmed: true, shipmentConfirmedAt: now, importBatchId: text(input.batchId).slice(0, 150),
                items, totalHpp, statusDataMarketplace: 'menunggu_data', penghasilanBersihMarketplace: null,
                statusPencairan: 'Belum Cair', stockDeductionApplied: true, sourceFileName: text(input.sourceFileName).slice(0, 250) };
        });
        const stockAfter = {};
        needs.forEach((qty, id) => {
            const p = products.get(id);
            const after = p.stock - qty;
            const update = { physical_stock: after };
            if (Object.prototype.hasOwnProperty.call(p, 'stokFisik')) update.stokFisik = after;
            transaction.update(p.ref, update);
            stockAfter[id] = after;
        });
        saved.forEach(record => {
            const data = { ...record }; delete data.id;
            transaction.set(db.collection('transactions').doc(record.id), data);
        });
        return { transactions: saved, stockDeltas: Object.fromEntries(needs), stockAfter, duplicateOrders: duplicates };
    });
}
module.exports = { confirmDispatchBatch, transactionId };

async function inspectDispatchOrders({ db, userId, input }) {
    const platform = input?.platform;
    const channelId = text(input?.channelId);
    if (!userId || !['shopee', 'tiktok'].includes(platform) || !channelId || !Array.isArray(input.orderIds) || !input.orderIds.length || input.orderIds.length > 200) fail(400, 'Daftar pesanan tidak valid.');
    const settings = await db.collection('settings').doc(userId).get();
    if (!(settings.exists ? settings.data().marketplaces || [] : []).some(channel => String(channel.id) === channelId && platformOf(channel.name) === platform)) fail(400, 'Pilih marketplace yang sesuai dengan Pengaturan.');
    const orderIds = [...new Set(input.orderIds.map(text))];
    if (orderIds.some(id => !id || id.length > 120 || !/^[a-z0-9_-]+$/i.test(id))) fail(400, 'ID pesanan tidak valid.');
    const lookup = [...new Set(orderIds.flatMap(id => [id, id.toUpperCase(), id.toLowerCase()]))];
    const existing = [];
    for (let offset = 0; offset < lookup.length; offset += 30) {
        const snap = await db.collection('transactions').where('userId', '==', userId).where('marketplaceOrderId', 'in', lookup.slice(offset, offset + 30)).get();
        snap.docs.forEach(doc => existing.push(doc.data()));
    }
    const alreadyRecorded = [];
    const uncertain = [];
    orderIds.forEach(orderId => {
        const sameId = existing.filter(record => key(record.marketplaceOrderId) === key(orderId));
        const matching = sameId.filter(record => String(record.channelId) === channelId || platformOf(record.platform || record.channel) === platform);
        if (matching.some(record => record.stockDeductionApplied === false)) uncertain.push({ orderId, message: 'Riwayat pesanan ini ada, tetapi pengurangan stok belum pasti. Periksa Riwayat Transaksi.' });
        else if (matching.length) alreadyRecorded.push(orderId);
        else if (sameId.some(record => !platformOf(record.platform || record.channel) && String(record.channelId) !== channelId)) uncertain.push({ orderId, message: 'ID ada pada transaksi lama yang marketplace-nya belum jelas.' });
    });
    return { alreadyRecorded, uncertain };
}
module.exports.inspectDispatchOrders = inspectDispatchOrders;
