export const dispatchText = value => String(value ?? '').trim();
export const dispatchKey = value => dispatchText(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
export const dispatchPlatform = value => /shopee/i.test(value || '') ? 'shopee' : /tiktok|tokopedia/i.test(value || '') ? 'tiktok' : '';

export function dispatchColor(value) {
    const key = dispatchKey(value);
    return ({ black: 'hitam', brokenwhite: 'bw', putihbw: 'bw', white: 'putih', cokelat: 'coklat' })[key] || key;
}

export function dispatchSize(value) {
    const text = dispatchText(value).toLowerCase();
    const numbered = text.match(/\bno\.?\s*(\d+)/);
    if (numbered) return 'no' + Number(numbered[1]);
    if (/plus\s*size/.test(text)) return 'plussize';
    if (/all\s*size/.test(text)) return 'allsize';
    const adult = text.replace(/dewasa|adult/g, '').replace(/\s/g, '');
    if (/^(xxxl|xxl|xl|xs|s|m|l)$/.test(adult)) return adult;
    return dispatchKey(value);
}

const COLUMNS = {
    shopee: {
        orderId: ['No. Pesanan', 'ID Pesanan'], status: ['Status Pesanan'], sku: ['Nomor Referensi SKU', 'Seller SKU'],
        variation: ['Nama Variasi'], qty: ['Jumlah'], tracking: ['No. Resi'], package: ['ID Paket'],
        name: ['Nama Produk'], created: ['Waktu Pesanan Dibuat'], cancelled: ['Status Pembatalan/ Pengembalian']
    },
    tiktok: {
        orderId: ['Order ID'], status: ['Order Status'], sku: ['Seller SKU'], skuId: ['SKU ID'],
        variation: ['Variation'], qty: ['Quantity'], tracking: ['Tracking ID'], package: ['Package ID'],
        name: ['Product Name'], created: ['Created Time'], cancelled: ['Cancelation/Return Type', 'Cancellation/Return Type']
    }
};
const SHIPPABLE = new Set(['perludikirim', 'toship', 'awaitingshipment', 'awaitingcollection', 'menunggupengambilan', 'readytoship', 'siapdikirim', 'dikirim', 'terkirim', 'shipped', 'delivered', 'completed', 'selesai', 'intransit', 'dalampengiriman']);

function headerMap(row, platform) {
    const keyToIndex = new Map(row.map((value, index) => [dispatchKey(value), index]));
    return Object.fromEntries(Object.entries(COLUMNS[platform]).map(([field, aliases]) =>
        [field, aliases.map(dispatchKey).map(key => keyToIndex.get(key)).find(index => index !== undefined)]
    ));
}

export function findDispatchSheets(workbook, XLSX, platform) {
    if (!COLUMNS[platform]) throw new Error('Platform impor tidak dikenal.');
    const result = [];
    for (const name of workbook.SheetNames || []) {
        const table = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });
        const headerIndex = table.slice(0, 20).findIndex(row => {
            const map = headerMap(row, platform);
            return ['orderId', 'status', 'sku', 'qty', 'variation'].every(field => map[field] !== undefined);
        });
        if (headerIndex >= 0) result.push({ name, table, headerIndex, columns: headerMap(table[headerIndex], platform) });
    }
    if (!result.length) {
        const other = platform === 'shopee' ? 'tiktok' : 'shopee';
        const wrongPlatform = (workbook.SheetNames || []).some(name => {
            const table = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });
            return table.slice(0, 20).some(row => { const map = headerMap(row, other); return map.orderId !== undefined && map.sku !== undefined && map.qty !== undefined; });
        });
        throw new Error(wrongPlatform ? 'File ini memakai format ' + (other === 'shopee' ? 'Shopee' : 'TikTok') + '. Buka halaman impor yang sesuai.' : 'Kolom ID pesanan, status, SKU, variasi, dan jumlah tidak ditemukan. Gunakan file ekspor asli menu Perlu dikirim.');
    }
    return result;
}

export function parseDispatchSheet(sheet, platform) {
    const grouped = new Map();
    const warnings = [];
    let descriptionsSkipped = 0;
    const c = sheet.columns;
    const cell = (row, field) => c[field] === undefined ? '' : row[c[field]];
    sheet.table.slice(sheet.headerIndex + 1).forEach((row, offset) => {
        if (!row.some(value => dispatchText(value))) return;
        const rowNumber = sheet.headerIndex + offset + 2;
        const rawId = cell(row, 'orderId');
        const orderId = dispatchText(rawId);
        const status = dispatchText(cell(row, 'status'));
        if (platform === 'tiktok' && /current order status/i.test(status) && /order id/i.test(orderId)) { descriptionsSkipped++; return; }
        if (!orderId || (typeof rawId === 'number' && !Number.isSafeInteger(rawId))) {
            warnings.push('Baris ' + rowNumber + ': ID pesanan kosong atau tersimpan sebagai angka yang kehilangan ketelitian.'); return;
        }
        const orderKey = dispatchKey(orderId);
        if (!grouped.has(orderKey)) grouped.set(orderKey, { key: orderKey, orderId, platform, status, trackingNumbers: [], packageIds: [], items: [], issues: [], excludedReason: '', createdAt: dispatchText(cell(row, 'created')) });
        const order = grouped.get(orderKey);
        const cancelled = dispatchText(cell(row, 'cancelled'));
        if ((cancelled && !/^(0|-|--|none|null|n\/a)$/i.test(cancelled)) || /batal|cancel|refund|retur|return/.test(dispatchKey(status))) order.excludedReason = 'Pesanan dibatalkan atau memiliki pembatalan/retur.';
        else if (!SHIPPABLE.has(dispatchKey(status))) order.excludedReason = 'Status sumber belum siap dikirim: ' + status;
        for (const [field, list] of [['tracking', 'trackingNumbers'], ['package', 'packageIds']]) {
            const value = dispatchText(cell(row, field));
            if (value && !order[list].includes(value)) order[list].push(value);
        }
        const rawQty = cell(row, 'qty');
        const qty = typeof rawQty === 'number' ? rawQty : /^\d+$/.test(dispatchText(rawQty)) ? Number(rawQty) : NaN;
        const variation = dispatchText(cell(row, 'variation'));
        const dimensions = variation.split(/[,|]/).map(dispatchText).filter(Boolean);
        const sellerSku = dispatchText(cell(row, 'sku'));
        const platformSkuId = dispatchText(cell(row, 'skuId'));
        const identity = JSON.stringify([dispatchKey(sellerSku), dispatchKey(platformSkuId), dispatchKey(variation)]);
        const occurrence = order.items.filter(item => item.identity === identity).length;
        const item = { key: identity + ':' + occurrence, identity, rowNumber, sellerSku, platformSkuId,
            name: dispatchText(cell(row, 'name')), variation, color: dimensions[0] || '', size: dimensions.slice(1).join(', '), qty: Number.isSafeInteger(qty) && qty > 0 ? qty : 0, issues: [] };
        if (!item.qty) item.issues.push('Jumlah pcs harus bilangan bulat lebih dari nol (baris ' + rowNumber + ').');
        if (!item.sellerSku) item.issues.push('SKU penjual kosong (baris ' + rowNumber + ').');
        order.items.push(item);
    });
    const orders = [...grouped.values()];
    return { orders, warnings, descriptionsSkipped, sourceRows: orders.reduce((sum, order) => sum + order.items.length, 0), qty: orders.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.qty, 0), 0) };
}

export function dispatchProductInfo(product, models = []) {
    const model = models.find(item => String(item.id) === String(product.model_id || product.modelId));
    return { id: product.docId || product.id, sku: product.sku || '', modelName: model?.namaModel || product.namaModel || product.modelName || product.nama || product.product_name || '',
        name: product.nama || product.product_name || model?.namaModel || product.sku || '', color: product.warna || product.color || model?.warna || '',
        size: product.ukuran || product.size || product.varian || product.variant || model?.ukuran || '', hpp: Number(product.hpp) || 0,
        stock: Number(product.physical_stock ?? product.stokFisik) || 0, product };
}

export function matchDispatchProduct(item, products, models = []) {
    const skuKeys = [item.sellerSku, item.platformSkuId].filter(Boolean).map(dispatchKey);
    const infos = products.map(product => dispatchProductInfo(product, models));
    const dimensionsMatch = info => (!item.color || dispatchColor(item.color) === dispatchColor(info.color)) &&
        (!item.size || dispatchSize(item.size) === dispatchSize(info.size));
    const exact = infos.filter(info => [info.product.sku, info.product.sellerSku, info.product.marketplaceSku, info.product.externalSku,
        info.product.tiktokSkuId, info.product.shopeeSkuId, info.modelName].filter(Boolean).map(dispatchKey).some(key => skuKeys.includes(key)) && dimensionsMatch(info));
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    let base = dispatchKey(item.sellerSku).replace(/black/g, 'hitam').replace(/brokenwhite/g, 'bw').replace(/cokelat/g, 'coklat');
    const size = dispatchSize(item.size);
    const color = dispatchColor(item.color);
    if (size && base.endsWith(size)) base = base.slice(0, -size.length);
    if (color && base.endsWith(color)) base = base.slice(0, -color.length);
    const matches = infos.filter(info => dimensionsMatch(info) && info.color && info.size &&
        [info.modelName, info.name, info.product.sku].filter(Boolean).some(value => dispatchKey(value) === base));
    return matches.length === 1 ? matches[0] : null;
}

export function resolveDispatchOrders(orders, products, models = [], overrides = {}) {
    return orders.map(order => {
        const items = order.items.map(item => {
            const overrideId = overrides[order.key + ':' + item.key];
            const selected = overrideId ? products.find(product => String(product.docId || product.id) === String(overrideId)) : null;
            const matched = overrideId ? (selected ? dispatchProductInfo(selected, models) : null) : matchDispatchProduct(item, products, models);
            const issues = [...(item.issues || [])];
            if (!matched?.id) issues.push('SKU, warna, dan ukuran belum cocok dengan satu produk Inventaris.');
            else if (!(matched.hpp > 0)) issues.push('HPP produk belum diisi.');
            return { ...item, product: matched, issues };
        });
        return { ...order, items, qty: items.reduce((sum, item) => sum + item.qty, 0), totalHpp: items.reduce((sum, item) => sum + (item.product?.hpp || 0) * item.qty, 0), issues: [...(order.issues || []), ...items.flatMap(item => item.issues)] };
    });
}

export function searchDispatchOrders(orders, query) {
    const key = dispatchKey(query);
    if (key.length < 3) return [];
    return orders.filter(order => dispatchKey(order.orderId).endsWith(key) || (order.trackingNumbers || []).some(id => dispatchKey(id) === key))
        .sort((a, b) => Number(dispatchKey(b.orderId) === key) - Number(dispatchKey(a.orderId) === key) || a.orderId.localeCompare(b.orderId));
}

export function dispatchStockNeeds(orders) {
    const needs = new Map();
    orders.forEach(order => order.items.forEach(item => {
        if (!item.product) return;
        const id = item.product.id;
        if (!needs.has(id)) needs.set(id, { ...item.product, qty: 0 });
        needs.get(id).qty += item.qty;
    }));
    return [...needs.values()];
}
