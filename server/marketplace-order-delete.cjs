const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function owned(snap, userId) { if (!snap.exists) fail(404, 'Pesanan sudah dihapus atau tidak ditemukan.'); const tx = snap.data(); if (tx.userId !== userId) fail(403, 'Pesanan bukan milik akun ini.'); return tx; }
function idFrom(input) { const id = String(input?.transactionId || ''); if (!/^[a-z0-9_-]{1,150}$/i.test(id)) fail(400, 'ID transaksi tidak valid.'); return id; }
function fingerprint(snap) { return hash(snap.id + ':' + JSON.stringify(snap.updateTime)); }
async function checkLinked(db, transaction, userId, id) {
    for (const [collection, field] of [['returns', 'originalTransactionId'], ['keuangan', 'transactionId']]) {
        const result = await transaction.get(db.collection(collection).where('userId', '==', userId).where(field, '==', id));
        if (result.docs.length) fail(409, 'Pesanan ini memiliki catatan retur atau keuangan tertaut. Selesaikan catatan terkait terlebih dahulu agar stok dan laporan tetap sesuai.');
    }
}
function restoreQty(tx) {
    if (tx.returnCompleted === true) return 0;
    if (tx.stockDeductionApplied === false) return 0;
    if (tx.stockDeductionApplied !== true) fail(409, 'Status pengurangan stok transaksi lama belum jelas. Pesanan belum dihapus agar stok tidak bertambah keliru.');
    if (!Array.isArray(tx.items) || !tx.items.length) fail(409, 'Rincian produk pesanan tidak lengkap.');
    return tx.items.reduce((sum, item) => { const qty = Number(item.qty); if (!Number.isSafeInteger(qty) || qty <= 0) fail(409, 'Jumlah produk pesanan tidak valid.'); return sum + qty; }, 0);
}
async function prepareOrderDeletion({ db, userId, input }) {
    const id = idFrom(input);
    return db.runTransaction(async transaction => {
        const snap = await transaction.get(db.collection('transactions').doc(id)); const tx = owned(snap, userId);
        await checkLinked(db, transaction, userId, id);
        return { transactionId: id, orderId: tx.marketplaceOrderId || id, fingerprint: fingerprint(snap), restoreQty: restoreQty(tx) };
    });
}
async function deleteMarketplaceOrder({ db, userId, input, now = new Date() }) {
    const id = idFrom(input);
    if (input.confirmationSteps !== 2 || !/^[a-f0-9]{64}$/.test(input.fingerprint || '')) fail(400, 'Selesaikan dua konfirmasi penghapusan terlebih dahulu.');
    const auditRef = db.collection('marketplace_order_deletions').doc(hash(JSON.stringify([userId, id, input.fingerprint])));
    return db.runTransaction(async transaction => {
        const audit = await transaction.get(auditRef);
        if (audit.exists) { const a = audit.data(); if (a.userId !== userId) fail(403, 'Penghapusan bukan milik akun ini.'); const current = await transaction.get(db.collection('transactions').doc(id)); if (current.exists) fail(409, 'Pesanan ini sudah diimpor ulang setelah dihapus. Muat ulang Riwayat Transaksi sebelum menghapusnya kembali.'); return { transactionId: id, orderId: a.orderId, platform: a.platform, alreadyDeleted: true, stockAfter: {} }; }
        const ref = db.collection('transactions').doc(id); const snap = await transaction.get(ref); const tx = owned(snap, userId);
        if (fingerprint(snap) !== input.fingerprint) fail(409, 'Pesanan berubah sejak konfirmasi dibuka. Periksa ulang lalu klik Hapus kembali.');
        await checkLinked(db, transaction, userId, id);
        const total = restoreQty(tx), needs = new Map();
        if (total) for (const item of tx.items) {
            let productId = item.docId || item.productId;
            if (!productId && item.sku) {
                const candidates = await transaction.get(db.collection('products').where('userId', '==', userId).where('sku', '==', item.sku));
                if (candidates.docs.length !== 1) fail(409, 'Produk ' + item.sku + ' tidak dapat dipastikan. Periksa Inventaris terlebih dahulu.');
                productId = candidates.docs[0].id;
            }
            if (!/^[a-z0-9_-]{1,128}$/i.test(productId || '')) fail(409, 'Referensi produk pesanan tidak valid.');
            needs.set(productId, (needs.get(productId) || 0) + Number(item.qty));
        }
        const products = new Map();
        for (const productId of needs.keys()) {
            const p = await transaction.get(db.collection('products').doc(productId));
            if (!p.exists || p.data().userId !== userId) fail(409, 'Produk tidak ditemukan pada Inventaris akun ini. Pesanan belum dihapus.');
            const stock = Number(p.data().physical_stock ?? p.data().stokFisik);
            if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(stock + needs.get(productId))) fail(409, 'Stok produk tidak valid.');
            products.set(productId, { ref: p.ref, data: p.data(), stock });
        }
        const stockAfter = {};
        for (const [productId, qty] of needs) {
            const p = products.get(productId), stock = p.stock + qty;
            transaction.update(p.ref, { physical_stock: stock, ...(Object.hasOwn(p.data, 'stokFisik') ? { stokFisik: stock } : {}) }); stockAfter[productId] = stock;
        }
        const platform = tx.platform || (/shopee/i.test(tx.channel || '') ? 'shopee' : /tiktok|tokopedia/i.test(tx.channel || '') ? 'tiktok' : '');
        const orderId = tx.marketplaceOrderId || '';
        transaction.set(auditRef, { userId, transactionId: id, orderId, platform, deletedAt: now, originalTransaction: tx, stockReturned: Object.fromEntries(needs) });
        transaction.delete(ref);
        return { transactionId: id, orderId, platform, stockAfter, restoredQty: total, alreadyDeleted: false };
    });
}
module.exports = { prepareOrderDeletion, deleteMarketplaceOrder };
