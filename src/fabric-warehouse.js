export const isFabricComplete = row => row.statusPemakaian === 'selesai';

// Delete stock documents atomically. Financial records, receipt bytes and cut
// movements are historical records and are deliberately not deleted here.
export async function deleteFabricStocks({ db, doc, runTransaction, userId, rows }) {
    if (!userId || !Array.isArray(rows) || !rows.length || rows.length > 200) {
        throw new Error('Pilih 1–200 batch kain untuk dihapus.');
    }
    const ids = rows.map(row => row?.id);
    if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id || id.includes('/'))) {
        throw new Error('Daftar batch kain tidak valid. Muat ulang lalu coba lagi.');
    }
    const refs = ids.map(id => doc(db, 'fabric_stock', id));
    return runTransaction(db, async transaction => {
        const snapshots = await Promise.all(refs.map(reference => transaction.get(reference)));
        snapshots.forEach((snapshot, index) => {
            if (!snapshot.exists()) return; // Retrying a successful deletion is safe.
            const current = snapshot.data();
            if (current.userId !== userId) throw new Error('Data kain bukan milik akun ini.');
            if ((current.purchaseId || snapshot.id) !== (rows[index].purchaseId || rows[index].id)) {
                throw new Error('Grup pembelian kain berubah. Muat ulang lalu coba lagi.');
            }
        });
        snapshots.forEach((snapshot, index) => {
            if (snapshot.exists()) transaction.delete(refs[index]);
        });
        return { ids, deletedCount: snapshots.filter(snapshot => snapshot.exists()).length };
    });
}

export function asFabricDate(value) {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : value.seconds != null ? new Date(value.seconds * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function fabricPurchaseValue(row) {
    const value = row.hargaTotalPembelian ?? (Number(row.jumlahBeliYard || 0) * Number(row.hargaBeliPerYard || 0));
    return Math.max(0, Number(value) || 0);
}

// Persist these shares on new purchases so rounding and later completion order
// never cause the invoice admin fee to be charged more than once.
export function allocateFabricAdmin(rows) {
    const groups = new Map();
    rows.forEach(row => {
        const key = row.purchaseId || row.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });
    const result = new Map();
    groups.forEach(group => {
        const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
        const fee = sorted.reduce((max, row) => Math.max(max, Number(row.biayaAdminPembelian) || 0), 0);
        const unknown = sorted.filter(row => row.biayaAdminBatch == null);
        let known = 0;
        sorted.filter(row => row.biayaAdminBatch != null).forEach(row => {
            const share = Math.max(0, Number(row.biayaAdminBatch) || 0);
            result.set(row.id, share);
            known += share;
        });
        const total = unknown.reduce((sum, row) => sum + fabricPurchaseValue(row), 0);
        const distributable = Math.max(0, fee - known);
        let left = distributable;
        unknown.forEach((row, index) => {
            const share = index === unknown.length - 1 ? left : Math.floor(distributable * (total ? fabricPurchaseValue(row) / total : 1 / unknown.length));
            result.set(row.id, share);
            left -= share;
        });
    });
    return result;
}

export function filterFabricHistory(rows, { period = 'all', start = '', end = '', now = new Date() } = {}) {
    if (period === 'all') return rows;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    if (period === 'last7') from.setDate(from.getDate() - 6);
    if (period === 'last30') from.setDate(from.getDate() - 29);
    if (period === 'month') from.setDate(1);
    if (period === 'year') { from.setMonth(0); from.setDate(1); }
    if (period === 'custom') {
        const customFrom = start ? new Date(start + 'T00:00:00') : null;
        const customUntil = end ? new Date(end + 'T23:59:59.999') : null;
        if ((start && Number.isNaN(customFrom.getTime())) || (end && Number.isNaN(customUntil.getTime())) || (customFrom && customUntil && customFrom > customUntil)) return [];
        return rows.filter(row => {
            const date = asFabricDate(row.tanggalBeli);
            return date && (!customFrom || date >= customFrom) && (!customUntil || date <= customUntil);
        });
    }
    return rows.filter(row => {
        const date = asFabricDate(row.tanggalBeli);
        return date && date >= from && date <= until;
    });
}

export function summarizeFabricHistory(rows) {
    const fees = new Map();
    const result = { rolls: 0, yard: 0, value: 0, admin: 0, total: 0, purchases: 0 };
    rows.forEach(row => {
        result.rolls += Math.max(0, Number(row.jumlahRoll ?? 1) || 0);
        result.yard += Math.max(0, Number(row.jumlahBeliYard) || 0);
        result.value += fabricPurchaseValue(row);
        const key = row.purchaseId || row.id;
        fees.set(key, Math.max(fees.get(key) || 0, Number(row.biayaAdminPembelian) || 0));
    });
    result.admin = [...fees.values()].reduce((sum, value) => sum + value, 0);
    result.total = result.value + result.admin;
    result.purchases = fees.size;
    return result;
}

export async function completeFabricStock({ db, doc, collection, runTransaction, userId, rows, selectedIds, date, mode = 'auto', existingExpenseId = '', purpose = '' }) {
    if (!userId || !selectedIds.length || selectedIds.length > 200 || !asFabricDate(date)) throw new Error('Pilih kain dan tanggal selesai yang benar.');
    if (!['auto', 'new', 'existing'].includes(mode)) throw new Error('Pilih pencatatan pengeluaran terlebih dahulu.');
    const wanted = new Set(selectedIds);
    const selected = rows.filter(row => wanted.has(row.id));
    if (selected.length !== wanted.size) throw new Error('Data kain berubah. Muat ulang lalu coba lagi.');
    const keys = new Set(selected.map(row => row.purchaseId || row.id));
    const related = rows.filter(row => keys.has(row.purchaseId || row.id));
    const expenseRef = doc(collection(db, 'keuangan'));
    const movementRefs = new Map(selected.map(row => [row.id, doc(collection(db, 'fabric_movements'))]));
    const completedAt = new Date();
    return runTransaction(db, async transaction => {
        const snapshots = await Promise.all(related.map(row => transaction.get(doc(db, 'fabric_stock', row.id))));
        const current = snapshots.filter(snapshot => snapshot.exists()).map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
        if (current.some(row => row.userId !== userId) || selectedIds.some(id => !current.some(row => row.id === id))) throw new Error('Data kain tidak ditemukan atau bukan milik akun ini.');
        const active = current.filter(row => wanted.has(row.id) && !isFabricComplete(row));
        const completed = current.filter(row => wanted.has(row.id) && isFabricComplete(row))
            .map(row => ({ ...row, tanggalBeli: asFabricDate(row.tanggalBeli) }));
        if (!active.length) return { rows: completed, expense: null, alreadyComplete: true };
        if (active.some(row => !Number.isFinite(Number(row.sisaYard)) || Number(row.sisaYard) < 0)) throw new Error('Sisa stok kain tidak valid. Periksa rincian terlebih dahulu.');
        const unlinked = active.filter(row => !row.financeRecordId);
        if (mode === 'existing' && unlinked.length && !existingExpenseId) throw new Error('Pilih pengeluaran produksi yang sudah ada.');
        const existingIds = new Set(active.map(row => row.financeRecordId).filter(Boolean));
        if (mode === 'existing' && unlinked.length) existingIds.add(existingExpenseId);
        // Read all linked expenses before any writes. Missing old links must be
        // reviewed rather than silently creating a second financial charge.
        const expenseSnapshots = await Promise.all([...existingIds].map(id => transaction.get(doc(db, 'keuangan', id))));
        expenseSnapshots.forEach(snapshot => {
            const expense = snapshot.data();
            if (!snapshot.exists() || expense.userId !== userId || !['pengeluaran', 'biaya'].includes(expense.jenis) || expense.tipeBiaya === 'operasional') throw new Error('Catatan pengeluaran lama tidak ditemukan atau tidak sesuai. Periksa Keuangan terlebih dahulu.');
        });
        const shares = allocateFabricAdmin(current);
        const newRows = mode === 'existing' ? [] : unlinked;
        const principal = newRows.reduce((sum, row) => sum + fabricPurchaseValue(row), 0);
        const admin = newRows.reduce((sum, row) => sum + shares.get(row.id), 0);
        if (newRows.some(row => fabricPurchaseValue(row) <= 0) || !Number.isFinite(principal + admin) || principal + admin > Number.MAX_SAFE_INTEGER) throw new Error('Nilai pembelian kain belum lengkap. Periksa rincian sebelum menyelesaikan.');
        let expense = null;
        if (newRows.length) {
            expense = {
                id: expenseRef.id, userId, jenis: 'pengeluaran', tipeBiaya: 'produksi', kategori: 'Pemakaian Kain', kategoriId: '',
                jumlahPokok: principal, adminFee: admin, jumlah: principal + admin, tanggal: date,
                catatan: 'Penyelesaian kain: ' + newRows.map(row => (row.kodeKain || 'K' + row.id.slice(0, 6).toUpperCase()) + ' ' + row.namaKain + ' ' + row.warna).join(', ') + (purpose ? '. ' + purpose : ''),
                source: 'fabric_completion', fabricStockIds: newRows.map(row => row.id), fabricPurchaseIds: [...new Set(newRows.map(row => row.purchaseId || row.id))], dibuatPada: completedAt
            };
            const record = { ...expense };
            delete record.id;
            transaction.set(expenseRef, record);
        }
        const updated = active.map(row => {
            const remaining = Math.max(0, Number(row.sisaYard) || 0);
            const financeRecordId = row.financeRecordId || (mode === 'existing' ? existingExpenseId : expenseRef.id);
            const code = row.kodeKain || 'K' + row.id.slice(0, 6).toUpperCase();
            const fields = { statusPemakaian: 'selesai', sisaYard: 0, tanggalSelesai: date, selesaiPada: completedAt, financeRecordId, biayaAdminBatch: shares.get(row.id), kodeKain: code };
            transaction.update(doc(db, 'fabric_stock', row.id), fields);
            if (remaining > 0) transaction.set(movementRefs.get(row.id), {
                userId, fabricId: row.id, purchaseId: row.purchaseId || row.id, kodeKain: code, namaKain: row.namaKain, warna: row.warna,
                tanggalPotong: date, yardPotong: remaining, nilaiDialihkan: remaining * (Number(row.hargaBeliPerYard) || 0),
                tujuanProduksi: purpose || 'Penyelesaian pemakaian kain', catatan: 'Sisa kain ditandai habis melalui tombol Selesai.', movementType: 'completion', dibuatPada: completedAt
            });
            return { ...row, ...fields, tanggalBeli: asFabricDate(row.tanggalBeli) };
        });
        return { rows: [...updated, ...completed], expense, alreadyComplete: false };
    });
}
