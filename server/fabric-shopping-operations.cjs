const { createHash } = require('node:crypto');
const SOURCE = 'fabric_shopping_operations';
const COLLECTION = 'fabric_shopping_operations';
const validId = value => typeof value === 'string' && /^[a-z0-9_-]{1,150}$/i.test(value);
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function recordId(userId, purchaseId) { return 'FSO-' + createHash('sha256').update(JSON.stringify([userId, purchaseId])).digest('hex'); }
const yardNumber = value => Math.round(Number(value) * 1000000) / 1000000;
function dateValue(day) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? new Date(day + 'T12:00:00+07:00') : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) fail(400, 'Tanggal pembayaran tidak valid.');
    return date;
}
function purchaseDate(value) { return value?.toDate ? value.toDate() : value || null; }
function present(snapshot) { return { ...snapshot.data(), id: snapshot.id }; }

async function listOperations({ db, userId }) {
    const snapshot = await db.collection(COLLECTION).where('userId', '==', userId).get();
    return { records: snapshot.docs.map(present) };
}

async function readGroup(transaction, db, userId, purchaseId) {
    const result = await transaction.get(db.collection('fabric_stock').where('userId', '==', userId).where('purchaseId', '==', purchaseId));
    if (result.docs.length) return result.docs.map(present);
    const legacy = await transaction.get(db.collection('fabric_stock').doc(purchaseId));
    if (!legacy.exists || legacy.data().userId !== userId || (legacy.data().purchaseId || legacy.id) !== purchaseId) fail(409, 'Pembelian kain berubah atau sudah dihapus. Muat ulang stok sebelum melanjutkan.');
    return [present(legacy)];
}

async function settleOperations({ db, userId, input, now = new Date() }) {
    const mode = input?.action;
    if (!['pay', 'legacy_paid', 'mark_unpaid', 'reopen_legacy'].includes(mode)) fail(400, 'Tindakan pembayaran tidak valid.');
    if (!Array.isArray(input.purchases) || !input.purchases.length || input.purchases.length > 50) fail(400, 'Pilih 1–50 nota per proses.');
    const purchases = input.purchases.map(item => {
        const rate = Number(item.rate), yard = Number(item.yard);
        if (!validId(item.purchaseId) || !Number.isSafeInteger(rate) || rate <= 0 || rate > 1000000 || !Number.isFinite(yard) || yard <= 0) fail(400, 'Nota, panjang kain, atau tarif operasional tidak valid.');
        return { purchaseId: item.purchaseId, rate, yard: yardNumber(yard) };
    });
    if (new Set(purchases.map(item => item.purchaseId)).size !== purchases.length) fail(400, 'Nota yang sama dipilih lebih dari sekali.');
    const unpaidMode = ['mark_unpaid', 'reopen_legacy'].includes(mode);
    const paidDate = unpaidMode ? null : dateValue(input.date);
    const note = String(input.note || '').trim().slice(0, 1000);
    const expenseRef = db.collection('keuangan').doc();
    return db.runTransaction(async transaction => {
        const refs = purchases.map(purchase => db.collection(COLLECTION).doc(recordId(userId, purchase.purchaseId)));
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
        const details = await Promise.all(purchases.map(async (purchase, index) => {
            const ref = refs[index], known = snapshots[index];
            if (known.exists && known.data().userId !== userId) fail(403, 'Catatan operasional bukan milik akun ini.');
            if (known.exists && known.data().status === 'paid') {
                if (mode === 'reopen_legacy') {
                    if (known.data().financeRecordId || known.data().entryMode !== 'legacy_paid') fail(409, 'Pembayaran ini terhubung ke Keuangan. Hapus pengeluarannya dari Keuangan untuk membatalkan pembayaran.');
                } else { return { existing: present(known) }; }
            }
            const rows = await readGroup(transaction, db, userId, purchase.purchaseId);
            if (rows.some(row => row.userId !== userId)) fail(403, 'Pembelian bukan milik akun ini.');
            if (rows.some(row => !Number.isFinite(Number(row.jumlahBeliYard)) || Number(row.jumlahBeliYard) <= 0)) fail(409, 'Panjang awal pembelian kain belum valid. Periksa rincian pembelian.');
            const yard = yardNumber(rows.reduce((sum, row) => sum + Number(row.jumlahBeliYard), 0));
            if (yard !== purchase.yard) fail(409, 'Panjang pembelian berubah. Muat ulang lalu periksa total pembayarannya.');
            const amount = Math.round(yard * purchase.rate);
            if (!Number.isSafeInteger(amount) || amount <= 0) fail(400, 'Nilai operasional melewati batas yang dapat dicatat.');
            return { prepared: { ref, data: { userId, purchaseId: purchase.purchaseId, yard, rate: purchase.rate, amount,
                status: unpaidMode ? 'unpaid' : 'paid', paidDate,
                financeRecordId: mode === 'pay' ? expenseRef.id : '', entryMode: unpaidMode ? 'mark_unpaid' : mode,
                names: [...new Set(rows.map(row => row.namaKain).filter(Boolean))].join(' · '),
                store: [...new Set(rows.map(row => row.toko).filter(Boolean))].join(' · '),
                purchaseDate: purchaseDate(rows[0].tanggalBeli), note, updatedAt: now,
                createdAt: known.exists ? known.data().createdAt || now : now } } };
        }));
        const prepared = details.filter(item => item.prepared).map(item => item.prepared);
        const existing = details.filter(item => item.existing).map(item => item.existing);
        const total = prepared.reduce((sum, item) => sum + item.data.amount, 0);
        if (!Number.isSafeInteger(total)) fail(400, 'Total operasional terlalu besar.');
        let expense = null;
        if (mode === 'pay' && prepared.length) {
            expense = { id: expenseRef.id, userId, jenis: 'pengeluaran', tipeBiaya: 'produksi', kategori: 'Operasional Belanja Kain', kategoriId: '',
                jumlahPokok: total, adminFee: 0, jumlah: total, tanggal: paidDate, dibuatPada: now, source: SOURCE,
                fabricShoppingPurchaseIds: prepared.map(item => item.data.purchaseId),
                fabricShoppingItems: prepared.map(({ data }) => ({ purchaseId: data.purchaseId, yard: data.yard, rate: data.rate, amount: data.amount })),
                catatan: 'Operasional belanja kain: ' + prepared.map(({ data }) => data.yard.toLocaleString('id-ID') + ' yard × Rp' + data.rate.toLocaleString('id-ID') + ' (N' + data.purchaseId.slice(0, 5).toUpperCase() + ')').join('; ') + (note ? '. ' + note : '') };
            const { id, ...record } = expense;
            transaction.set(expenseRef, record);
        }
        for (const item of prepared) transaction.set(item.ref, item.data);
        return { records: [...existing, ...prepared.map(item => ({ id: item.ref.id, ...item.data }))], expense, alreadyPaid: !prepared.length };
    });
}

async function cancelOperationsPayment({ db, userId, input, now = new Date() }) {
    if (!validId(input?.financeId)) fail(400, 'ID pengeluaran tidak valid.');
    return db.runTransaction(async transaction => {
        const ref = db.collection('keuangan').doc(input.financeId), snapshot = await transaction.get(ref);
        if (!snapshot.exists) return { records: [], deletedExpenseId: ref.id, alreadyDeleted: true };
        const expense = snapshot.data();
        if (expense.userId !== userId || expense.source !== SOURCE) fail(403, 'Pengeluaran operasional tidak ditemukan pada akun ini.');
        const ids = expense.fabricShoppingPurchaseIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !validId(id))) fail(409, 'Referensi pembayaran belum lengkap. Periksa data sebelum menghapus.');
        const records = await Promise.all(ids.map(id => transaction.get(db.collection(COLLECTION).doc(recordId(userId, id)))));
        for (const record of records) {
            if (!record.exists || record.data().userId !== userId || record.data().financeRecordId !== ref.id || record.data().status !== 'paid') fail(409, 'Status pembayaran berubah. Muat ulang sebelum menghapus pengeluaran.');
        }
        const updates = records.map(record => ({ ...record.data(), status: 'unpaid', financeRecordId: '', paidDate: null, entryMode: 'mark_unpaid', canceledAt: now, updatedAt: now }));
        records.forEach((record, index) => transaction.set(record.ref, updates[index]));
        transaction.delete(ref);
        return { records: updates.map((record, index) => ({ id: records[index].id, ...record })), deletedExpenseId: ref.id };
    });
}

module.exports = { SOURCE, recordId, listOperations, settleOperations, cancelOperationsPayment };
