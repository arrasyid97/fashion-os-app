<template>
    <div class="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div class="mx-auto max-w-7xl space-y-6">
            <header>
                <p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Operasional Marketplace</p>
                <h1 class="mt-1 text-3xl font-bold text-slate-900">Impor Pesanan Terkirim</h1>
                <p class="mt-2 max-w-3xl text-sm text-slate-600">
                    Impor tab hasil pencocokan Google Sheets. Hanya paket berstatus terkirim yang akan menjadi transaksi dan mengurangi stok.
                    HPP diambil dari master produk saat impor.
                </p>
            </header>

            <section class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <h2 class="font-bold text-indigo-950">Alur kerja</h2>
                <ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-indigo-900">
                    <li>Scan ID paket atau resi di Google Sheets.</li>
                    <li>Tempel ekspor pesanan terkirim Shopee/TikTok, lalu cocokkan ID scan, SKU, jumlah, dan status.</li>
                    <li>Unduh file hasil pencocokan, kemudian pilih tab <strong>SIAP_IMPORT</strong> di file Excel.</li>
                    <li>Periksa hasil validasi di sini. Transaksi yang diimpor akan masuk dengan status menunggu data penghasilan marketplace.</li>
                </ol>
                <p class="mt-3 text-xs text-indigo-800">
                    Gunakan kolom: Channel, ID Pesanan, ID Paket, No Resi, Tanggal Terkirim, SKU, Qty, Status.
                    Status yang diterima: Terkirim, Dikirim, Shipped, Delivered, Selesai, atau Siap Import.
                </p>
            </section>

            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 class="font-bold text-slate-900">1. Siapkan file hasil pencocokan</h2>
                        <p class="mt-1 text-sm text-slate-500">Bisa berupa .xlsx atau .csv dari Google Sheets.</p>
                    </div>
                    <button type="button" @click="downloadTemplate" class="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                        Unduh Template
                    </button>
                </div>
                <div class="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                    <label class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">File hasil pencocokan</span>
                        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" @change="handleFile" class="block w-full rounded-lg border border-slate-300 p-2 text-sm">
                    </label>
                    <label v-if="sheetNames.length > 1" class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Tab yang diimpor</span>
                        <select v-model="selectedSheet" @change="parseSelectedSheet" class="w-full rounded-lg border border-slate-300 p-2 text-sm">
                            <option v-for="name in sheetNames" :key="name" :value="name">{{ name }}</option>
                        </select>
                    </label>
                </div>
                <p v-if="fileName" class="mt-2 text-xs text-slate-500">File: {{ fileName }}</p>
                <p v-if="fileError" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ fileError }}</p>
            </section>

            <section v-if="packages.length || rowErrors.length" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 class="font-bold text-slate-900">2. Periksa data sebelum impor</h2>
                        <p class="mt-1 text-sm text-slate-500">Pastikan channel, ID pesanan, SKU, jumlah, dan status pengiriman sudah benar.</p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs font-semibold">
                        <span class="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{{ packages.length }} paket valid</span>
                        <span class="rounded-full bg-red-100 px-3 py-1 text-red-800">{{ rowErrors.length }} baris bermasalah</span>
                    </div>
                </div>

                <div v-if="rowErrors.length" class="mt-4 max-h-56 overflow-auto rounded-xl border border-red-200 bg-red-50 p-3">
                    <p class="mb-2 text-sm font-semibold text-red-800">Perbaiki baris ini di Google Sheets, lalu unggah ulang:</p>
                    <ul class="list-inside list-disc space-y-1 text-xs text-red-700">
                        <li v-for="issue in rowErrors.slice(0, 100)" :key="issue.key">Baris {{ issue.row }}: {{ issue.message }}</li>
                    </ul>
                    <p v-if="rowErrors.length > 100" class="mt-2 text-xs text-red-700">Dan {{ rowErrors.length - 100 }} masalah lainnya.</p>
                </div>

                <div v-if="packages.length" class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table class="w-full min-w-[760px] text-left text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th class="p-3">Channel</th>
                                <th class="p-3">ID Pesanan</th>
                                <th class="p-3">ID Paket / Resi</th>
                                <th class="p-3">Tanggal Terkirim</th>
                                <th class="p-3">Isi Paket</th>
                                <th class="p-3">Total HPP</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            <tr v-for="group in packages.slice(0, 100)" :key="group.key">
                                <td class="p-3">{{ group.channelName }}</td>
                                <td class="p-3 font-medium">{{ group.orderId }}</td>
                                <td class="p-3">{{ group.packageId || group.trackingNumber || '—' }}</td>
                                <td class="p-3">{{ formatDate(group.shippedAt) }}</td>
                                <td class="p-3">{{ group.items.length }} SKU · {{ group.items.reduce((sum, item) => sum + item.qty, 0) }} pcs</td>
                                <td class="p-3">{{ formatCurrency(group.totalHpp) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-if="packages.length > 100" class="p-3 text-xs text-slate-500">Pratinjau menampilkan 100 paket pertama.</p>
                </div>

                <div v-if="importError" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ importError }}</div>
                <div v-if="importMessage" class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ importMessage }}</div>

                <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p class="max-w-2xl text-xs text-slate-500">Baris bermasalah menghentikan seluruh impor agar data tidak masuk setengah-setengah. Pesanan yang pernah tercatat akan dilewati sebagai duplikat.</p>
                    <button type="button" @click="importPackages" :disabled="!canImport" class="rounded-lg bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {{ isImporting ? 'Mengimpor…' : 'Impor paket valid' }}
                    </button>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, ref } from 'vue';
import * as XLSX from 'xlsx';
import { db } from '../firebase.js';
import { collection, doc, getDocs, increment, query, where, writeBatch } from 'firebase/firestore';

const props = defineProps({
    products: { type: Array, default: () => [] },
    marketplaces: { type: Array, default: () => [] },
    userId: { type: String, default: '' },
    subscriptionActive: { type: Boolean, default: true }
});
const emit = defineEmits(['completed']);

const fileInput = ref(null);
const fileName = ref('');
const fileError = ref('');
const importError = ref('');
const importMessage = ref('');
const workbook = ref(null);
const sheetNames = ref([]);
const selectedSheet = ref('');
const packages = ref([]);
const rowErrors = ref([]);
const isImporting = ref(false);

const canImport = computed(() =>
    !isImporting.value &&
    props.subscriptionActive &&
    Boolean(props.userId) &&
    packages.value.length > 0 &&
    rowErrors.value.length === 0
);

const normalizeHeader = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const headerAliases = {
    channel: ['channel', 'marketplace', 'platform', 'nama marketplace', 'nama channel'],
    orderId: ['id pesanan', 'id pesanan marketplace', 'order id', 'orderid', 'order sn', 'ordersn', 'nomor pesanan', 'no pesanan', 'nomor order'],
    packageId: ['id paket', 'package id', 'packageid', 'package sn', 'packagesn', 'shipment id', 'id pengiriman', 'nomor paket'],
    trackingNumber: ['no resi', 'nomor resi', 'resi', 'tracking number', 'tracking no', 'awb', 'airway bill', 'nomor resi pengiriman'],
    shippedAt: ['tanggal terkirim', 'tanggal dikirim', 'tanggal pengiriman', 'tanggal kirim', 'shipped at', 'shipped date', 'ship date', 'waktu pengiriman'],
    sku: ['sku', 'sku penjual', 'seller sku', 'seller product sku', 'product sku', 'kode sku'],
    qty: ['qty', 'quantity', 'jumlah', 'kuantitas', 'jumlah produk'],
    status: ['status', 'status pesanan', 'status pengiriman', 'shipping status', 'shipment status', 'order status']
};

const findColumn = (headers, field) => {
    const aliases = new Set(headerAliases[field].map(normalizeHeader));
    return headers.find(header => aliases.has(normalizeHeader(header)));
};

const cellValue = (row, column) => column ? row[column] : '';
const cleanText = value => String(value ?? '').trim();
const normalizeKey = value => cleanText(value).toLocaleLowerCase('id-ID').replace(/\s+/g, '');

function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' && value > 0) {
        const parts = XLSX.SSF.parse_date_code(value);
        if (parts) return new Date(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S);
    }
    const text = cleanText(value);
    if (!text) return null;
    const idDate = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (idDate) return new Date(Number(idDate[3]), Number(idDate[2]) - 1, Number(idDate[1]), Number(idDate[4] || 0), Number(idDate[5] || 0), Number(idDate[6] || 0));
    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), Number(isoDate[4] || 0), Number(isoDate[5] || 0), Number(isoDate[6] || 0));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const shippedStatusTokens = new Set([
    'terkirim', 'dikirim', 'sudahdikirim', 'pesanandikirim', 'sedangdikirim', 'shipped', 'delivered',
    'selesai', 'completed', 'pesananselesai', 'siapimport', 'readytoimport'
]);

function channelFor(value) {
    const key = normalizeKey(value);
    const exact = props.marketplaces.find(channel =>
        normalizeKey(channel.id) === key || normalizeKey(channel.name) === key
    );
    if (exact) return exact;
    if (key.startsWith('tiktok')) return props.marketplaces.find(channel => normalizeKey(channel.name).startsWith('tiktok'));
    if (key.startsWith('shopee')) return props.marketplaces.find(channel => normalizeKey(channel.name).startsWith('shopee'));
    return null;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function formatDate(value) {
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(value);
}

function downloadTemplate() {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Channel', 'ID Pesanan', 'ID Paket', 'No Resi', 'Tanggal Terkirim', 'SKU', 'Qty', 'Status']
    ]);
    sheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 16 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'SIAP_IMPORT');
    XLSX.writeFile(book, 'Template_Impor_Pesanan_Terkirim.xlsx');
}

async function handleFile(event) {
    const file = event.target.files?.[0];
    resetPreview();
    if (!file) return;
    fileName.value = file.name;
    fileError.value = '';
    try {
        const buffer = await file.arrayBuffer();
        const parsedBook = XLSX.read(buffer, { type: 'array', cellDates: true });
        if (!parsedBook.SheetNames?.length) throw new Error('File tidak berisi tab yang dapat dibaca.');
        workbook.value = parsedBook;
        sheetNames.value = parsedBook.SheetNames;
        selectedSheet.value = parsedBook.SheetNames.find(name => normalizeKey(name) === 'siapimport') || parsedBook.SheetNames[0];
        parseSelectedSheet();
    } catch (error) {
        fileError.value = error.message || 'File gagal dibaca.';
    }
}

function resetPreview() {
    fileError.value = '';
    importError.value = '';
    importMessage.value = '';
    workbook.value = null;
    sheetNames.value = [];
    selectedSheet.value = '';
    packages.value = [];
    rowErrors.value = [];
}

function parseSelectedSheet() {
    fileError.value = '';
    importError.value = '';
    importMessage.value = '';
    rowErrors.value = [];
    packages.value = [];
    const sheet = workbook.value?.Sheets?.[selectedSheet.value];
    if (!sheet) return;
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (!records.length) {
        fileError.value = 'Tab ini kosong. Pastikan baris pertama berisi nama kolom dan ada data pesanan di bawahnya.';
        return;
    }

    const headers = Object.keys(records[0]);
    const columns = Object.fromEntries(Object.keys(headerAliases).map(field => [field, findColumn(headers, field)]));
    const required = ['channel', 'orderId', 'shippedAt', 'sku', 'qty', 'status'];
    const missing = required.filter(field => !columns[field]);
    if (missing.length) {
        fileError.value = 'Kolom wajib belum ditemukan: ' + missing.map(field => ({
            channel: 'Channel', orderId: 'ID Pesanan', shippedAt: 'Tanggal Terkirim',
            sku: 'SKU', qty: 'Qty', status: 'Status'
        }[field])).join(', ') + '. Unduh template untuk melihat nama kolom yang benar.';
        return;
    }

    const grouped = new Map();
    records.forEach((row, index) => {
        const rowNumber = index + 2;
        const channelText = cleanText(cellValue(row, columns.channel));
        const orderId = cleanText(cellValue(row, columns.orderId));
        const packageId = cleanText(cellValue(row, columns.packageId));
        const trackingNumber = cleanText(cellValue(row, columns.trackingNumber));
        const sku = cleanText(cellValue(row, columns.sku));
        const status = normalizeKey(cellValue(row, columns.status));
        const qtyValue = Number(String(cellValue(row, columns.qty)).replace(',', '.'));
        const shippedAt = parseDate(cellValue(row, columns.shippedAt));
        const channel = channelFor(channelText);
        const product = props.products.find(item => normalizeKey(item.sku) === normalizeKey(sku));
        const issues = [];

        if (!channel) issues.push('Channel tidak cocok dengan daftar Marketplace di Fashion OS');
        if (!orderId) issues.push('ID Pesanan kosong');
        if (!sku) issues.push('SKU kosong');
        if (!Number.isInteger(qtyValue) || qtyValue <= 0) issues.push('Qty harus bilangan bulat lebih dari 0');
        if (!shippedStatusTokens.has(status)) issues.push('Status bukan status terkirim yang diizinkan');
        if (!shippedAt) issues.push('Tanggal Terkirim kosong atau formatnya tidak dikenali');
        if (!product) issues.push('SKU tidak ditemukan di master produk');
        else if (!product.docId && !product.id) issues.push('ID dokumen produk tidak tersedia; muat ulang data master produk');
        else if (!(Number(product.hpp) > 0)) issues.push('HPP produk belum diisi atau masih 0');

        if (issues.length) {
            rowErrors.value.push({ key: 'row-' + rowNumber, row: rowNumber, message: issues.join('; ') });
            return;
        }

        const effectivePackageId = packageId || trackingNumber;
        const packageKey = [channel.id, orderId, effectivePackageId || orderId].map(normalizeKey).join('|');
        if (!grouped.has(packageKey)) {
            grouped.set(packageKey, {
                key: packageKey,
                channelId: channel.id,
                channelName: channel.name,
                orderId,
                packageId,
                trackingNumber,
                shippedAt,
                itemsBySku: new Map()
            });
        }

        const group = grouped.get(packageKey);
        const lineKey = normalizeKey(sku);
        if (group.itemsBySku.has(lineKey)) {
            group.itemsBySku.get(lineKey).qty += qtyValue;
        } else {
            group.itemsBySku.set(lineKey, {
                sku: product.sku,
                qty: qtyValue,
                hpp: Number(product.hpp) || 0,
                docId: product.docId || product.id || '',
                nama: product.nama || product.product_name || '',
                model_id: product.model_id || product.modelId || '',
                warna: product.warna || product.color || '',
                varian: product.varian || product.variant || ''
            });
        }
    });

    packages.value = Array.from(grouped.values()).map(group => {
        const items = Array.from(group.itemsBySku.values());
        return {
            ...group,
            items,
            totalHpp: items.reduce((sum, item) => sum + (item.hpp * item.qty), 0)
        };
    }).sort((a, b) => a.channelName.localeCompare(b.channelName) || a.orderId.localeCompare(b.orderId));
}

async function fetchExistingTransactions(orderIds) {
    const uniqueIds = Array.from(new Set(orderIds));
    const existing = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 30) {
        const ids = uniqueIds.slice(offset, offset + 30);
        const snapshot = await getDocs(query(
            collection(db, 'transactions'),
            where('userId', '==', props.userId),
            where('marketplaceOrderId', 'in', ids)
        ));
        snapshot.docs.forEach(docSnap => existing.push({ id: docSnap.id, ...docSnap.data() }));
    }
    return existing;
}

function stockShortages(importPackages) {
    const requested = new Map();
    importPackages.forEach(group => group.items.forEach(item => {
        const current = requested.get(item.docId) || { name: item.nama || item.sku, qty: 0, stock: Number(props.products.find(p => (p.docId || p.id) === item.docId)?.physical_stock ?? props.products.find(p => (p.docId || p.id) === item.docId)?.stokFisik) || 0 };
        current.qty += item.qty;
        requested.set(item.docId, current);
    }));
    return Array.from(requested.values()).filter(item => item.qty > item.stock);
}

async function importPackages() {
    if (!canImport.value) return;
    importError.value = '';
    importMessage.value = '';
    isImporting.value = true;
    try {
        const existing = await fetchExistingTransactions(packages.value.map(group => group.orderId));
        const duplicates = [];
        const ambiguous = [];
        const toImport = packages.value.filter(group => {
            const matchingOrders = existing.filter(transaction =>
                normalizeKey(transaction.marketplaceOrderId) === normalizeKey(group.orderId) &&
                (normalizeKey(transaction.channelId) === normalizeKey(group.channelId) || normalizeKey(transaction.channel) === normalizeKey(group.channelName))
            );
            const pkgKey = normalizeKey(group.packageId || group.trackingNumber);
            if (pkgKey && matchingOrders.some(transaction =>
                normalizeKey(transaction.externalPackageId || transaction.trackingNumber) === pkgKey
            )) {
                duplicates.push(group);
                return false;
            }
            if (!pkgKey && matchingOrders.length) {
                duplicates.push(group);
                return false;
            }
            if (pkgKey && matchingOrders.some(transaction =>
                !transaction.externalPackageId && !transaction.trackingNumber
            )) {
                ambiguous.push(group);
                return false;
            }
            return true;
        });

        if (ambiguous.length) {
            const list = ambiguous.slice(0, 5).map(group => group.orderId).join(', ');
            throw new Error('Ada ID pesanan yang sudah pernah tercatat tanpa ID paket, jadi sistem tidak bisa memastikan ini bukan kiriman ganda (' + list + '). Periksa transaksi lama terlebih dahulu.');
        }
        if (!toImport.length) {
            importMessage.value = 'Semua paket pada file sudah pernah diimpor. Tidak ada transaksi atau pengurangan stok baru.';
            return;
        }

        const shortages = stockShortages(toImport);
        if (shortages.length) {
            const details = shortages.slice(0, 8).map(item => `${item.name}: stok ${item.stock}, akan dikirim ${item.qty}`).join('\n');
            if (!window.confirm('Stok Fashion OS kurang untuk sebagian paket. Karena paket pada file sudah terkonfirmasi terkirim, impor akan tetap mencatat penjualan dan stok dapat menjadi minus.\n\n' + details + '\n\nLanjutkan impor?')) return;
        }

        const batchId = 'SHEET-' + Date.now();
        let importedCount = 0;
        const chunkSize = 25;

        for (let offset = 0; offset < toImport.length; offset += chunkSize) {
            const chunk = toImport.slice(offset, offset + chunkSize);
            const batch = writeBatch(db);
            const stockDeltas = new Map();
            const saved = [];
            chunk.forEach(group => {
                const transactionData = {
                    marketplaceOrderId: group.orderId,
                    externalPackageId: group.packageId || '',
                    trackingNumber: group.trackingNumber || '',
                    tanggal: group.shippedAt,
                    tanggalTerkirim: group.shippedAt,
                    inputSource: 'google_sheets_shipped_import',
                    importBatchId: batchId,
                    items: group.items.map(item => ({
                        sku: item.sku,
                        qty: item.qty,
                        hpp: item.hpp,
                        model_id: item.model_id,
                        nama: item.nama,
                        warna: item.warna,
                        varian: item.varian
                    })),
                    totalHpp: group.totalHpp,
                    statusDataMarketplace: 'menunggu_data',
                    penghasilanBersihMarketplace: null,
                    channel: group.channelName,
                    channelId: group.channelId,
                    statusPencairan: 'Belum Cair',
                    userId: props.userId
                };
                const transactionRef = doc(collection(db, 'transactions'));
                batch.set(transactionRef, transactionData);
                saved.push({ ...transactionData, id: transactionRef.id });
                group.items.forEach(item => {
                    stockDeltas.set(item.docId, (stockDeltas.get(item.docId) || 0) + item.qty);
                });
            });
            stockDeltas.forEach((qty, productId) => {
                batch.update(doc(db, 'products', productId), { physical_stock: increment(-qty) });
            });
            await batch.commit();
            importedCount += saved.length;
            emit('completed', { transactions: saved, stockDeltas: Object.fromEntries(stockDeltas) });
        }

        importMessage.value = `${importedCount} paket berhasil diimpor. ${duplicates.length} paket duplikat dilewati tanpa mengurangi stok lagi.`;
        if (duplicates.length) importMessage.value += ' Duplikat: ' + duplicates.slice(0, 8).map(group => group.orderId).join(', ');
    } catch (error) {
        console.error('Gagal mengimpor pesanan terkirim:', error);
        importError.value = error?.message || 'Impor gagal. Tidak ada perubahan yang berhasil diproses pada paket terakhir.';
    } finally {
        isImporting.value = false;
    }
}
</script>
