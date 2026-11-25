export const DEFAULT_SHOPPING_RATE = 100;

export function shoppingYard(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 1000000) / 1000000 : 0;
}

export function shoppingAmount(yard, rate) {
    return Math.round(shoppingYard(yard) * Number(rate || 0));
}

export function shoppingDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const seconds = value.seconds ?? value._seconds;
    const date = seconds == null ? new Date(value) : new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function buildShoppingGroups(rows, records) {
    const groups = new Map();
    for (const row of rows || []) {
        const id = row.purchaseId || row.id;
        if (!id) continue;
        if (!groups.has(id)) groups.set(id, { purchaseId: id, rows: [] });
        groups.get(id).rows.push(row);
    }
    const known = new Map((records || []).map(record => [record.purchaseId, record]));
    // A paid record remains visible after stock deletion, as its expense is kept.
    for (const record of records || []) if (record.status === 'paid' && !groups.has(record.purchaseId)) {
        groups.set(record.purchaseId, { purchaseId: record.purchaseId, rows: [], archived: true });
    }
    return [...groups.values()].map(group => {
        const record = known.get(group.purchaseId);
        const paid = record?.status === 'paid';
        const status = paid ? 'paid' : record?.status === 'unpaid' || group.rows.every(row => row.shoppingOperationsVersion === 1) ? 'unpaid' : 'review';
        const rate = Number(record?.rate ?? group.rows[0]?.shoppingOperationsRate ?? DEFAULT_SHOPPING_RATE);
        const currentYard = shoppingYard(group.rows.reduce((sum, row) => sum + shoppingYard(row.jumlahBeliYard), 0));
        const yard = paid ? shoppingYard(record.yard) : currentYard;
        const dates = group.rows.map(row => shoppingDate(row.tanggalBeli)).filter(Boolean);
        return { ...group, record, status, rate, yard, currentYard,
            amount: paid ? Number(record.amount) : shoppingAmount(yard, rate),
            code: 'N' + group.purchaseId.slice(0, 5).toUpperCase(),
            names: [...new Set(group.rows.map(row => row.namaKain).filter(Boolean))].join(' · ') || record?.names || 'Pembelian dihapus',
            store: [...new Set(group.rows.map(row => row.toko).filter(Boolean))].join(' · ') || record?.store || '—',
            date: dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : shoppingDate(record?.purchaseDate)
        };
    }).sort((a, b) => Number(b.date) - Number(a.date));
}

export function summarizeShoppingGroups(groups) {
    const summary = { paid: { yard: 0, amount: 0, count: 0 }, unpaid: { yard: 0, amount: 0, count: 0 }, review: { yard: 0, amount: 0, count: 0 } };
    for (const group of groups) {
        const bucket = summary[group.status];
        bucket.yard = shoppingYard(bucket.yard + group.yard);
        bucket.amount += group.amount;
        bucket.count++;
    }
    return summary;
}
