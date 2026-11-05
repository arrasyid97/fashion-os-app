<template>
    <div class="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div class="mx-auto max-w-7xl space-y-6">
            <header>
                <p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Operasional Marketplace</p>
                <h1 class="mt-1 text-3xl font-bold text-slate-900">Impor Pesanan Terkirim</h1>
                <p class="mt-2 max-w-3xl text-sm text-slate-600">
Scan ID pesanan saat paket siap dikirim. Setelah itu unggah ekspor pesanan berstatus Dikirim dari Shopee atau TikTok. Fashion OS mencocokkan ID dan membaca produk, variasi, jumlah, serta HPP dari master produk.
                </p>
            </header>

            <section class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <h2 class="font-bold text-indigo-950">Alur pencatatan pesanan</h2>
                <ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-indigo-900">
                    <li>Scan ID pesanan yang paketnya siap dikirim. Scan hanya menyimpan ID sementara, belum membuat transaksi atau mengurangi stok.</li>
                    <li>Setelah data pengiriman tersedia, unggah ekspor menu Dikirim dari marketplace yang sama.</li>
                    <li>Fashion OS mencocokkan ID scan dengan ekspor, lalu membaca SKU, nama/variasi produk, dan jumlah dari file.</li>
                    <li>Hanya pesanan yang cocok dan berstatus sudah dikirim yang diimpor. Setelah dana dilepas, tempel ID sukses pada bagian konfirmasi dan catat total pencairan periode tanpa mengunggah file.</li>
                </ol>
                <p class="mt-3 text-xs text-indigo-800">Antrean scan disimpan di browser/perangkat ini. Pastikan menggunakan browser yang sama sampai ekspor Dikirim diimpor.</p>
            </section>
            <section class="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-end gap-3">
                    <label class="block min-w-48">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Marketplace yang discan</span>
                        <select v-model="scanChannelId" class="w-full rounded-lg border border-slate-300 p-2">
                            <option value="">Pilih marketplace</option>
                            <option v-for="marketplace in marketplaces" :key="marketplace.id" :value="marketplace.id">{{ marketplace.name }}</option>
                        </select>
                    </label>
                    <label class="block min-w-64 flex-1">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Scan atau tempel ID Pesanan / Paket / Resi</span>
                        <input ref="scanInput" v-model="scanInputValue" @paste="pasteScannedPackages" @keydown.enter.prevent="addScannedPackage" autocomplete="off" placeholder="Tempel daftar ID dari Sheet, atau scan satu per satu (otomatis tersimpan saat tekan Enter)" class="w-full rounded-lg border border-slate-300 p-2">
                        <span class="mt-1 block text-xs text-slate-500">Bisa tempel beberapa ID sekaligus dari satu kolom Google Sheet atau Excel. Saat memakai scanner, arahkan ke kolom ini; tiap scan otomatis tersimpan saat scanner mengirim Enter.</span>
                    </label>
                </div>
                <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm text-slate-600">{{ scanQueue.length }} ID tersimpan · {{ matchedPackages.length }} cocok dengan file</p>
                    <button type="button" @click="clearScanQueue" :disabled="!scanQueue.length" class="text-sm font-semibold text-red-600 disabled:text-slate-300">Kosongkan antrean</button>
                </div>
                <div v-if="scanQueue.length" class="mt-3 max-h-52 overflow-auto rounded-lg border border-slate-200">
                    <div v-for="scan in scanQueue" :key="scan.id" class="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                        <div class="min-w-0">
                            <p class="truncate font-mono text-sm font-semibold">{{ scan.value }}</p>
                            <p class="text-xs text-slate-500">{{ scan.channelName }} · {{ formatScanDate(scan.scannedAt) }}</p>
                        </div>
                        <button type="button" @click="removeScan(scan.id)" class="shrink-0 text-sm text-red-600">Hapus</button>
                    </div>
                </div>
            </section>

            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 class="font-bold text-slate-900">Unggah ekspor pesanan Dikirim</h2>
                        <p class="mt-1 text-sm text-slate-500">Pilih file asli dari Seller Center. Fashion OS akan membaca kolom produk dan jumlah secara otomatis.</p>
                    </div>
                </div>
                <div class="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                    <label class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">Marketplace pada file</span>
                        <select v-model="shipmentChannelId" @change="parseSelectedSheet" class="w-full rounded-lg border border-slate-300 p-2 text-sm">
                            <option value="">Pilih marketplace</option>
                            <option v-for="marketplace in marketplaces" :key="marketplace.id" :value="marketplace.id">{{ marketplace.name }}</option>
                        </select>
                    </label>
                    <label class="block">
                        <span class="mb-1 block text-sm font-medium text-slate-700">File ekspor pesanan Dikirim</span>
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

            <section v-if="scanQueue.length || packages.length || rowErrors.length" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 class="font-bold text-slate-900">2. Periksa data sebelum impor</h2>
                        <p class="mt-1 text-sm text-slate-500">Hanya data yang ID-nya sudah discan dan ditemukan di file yang akan diimpor.</p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs font-semibold">
                        <span class="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{{ packages.length }} pesanan terbaca</span>
                        <span class="rounded-full bg-red-100 px-3 py-1 text-red-800">{{ rowErrors.length }} baris bermasalah</span>
                    </div>
                </div>

                <div v-if="rowErrors.length" class="mt-4 max-h-56 overflow-auto rounded-xl border border-red-200 bg-red-50 p-3">
                    <p class="mb-2 text-sm font-semibold text-red-800">Periksa data ekspor atau cocokkan produk dengan master Fashion OS:</p>
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
                            <tr v-for="group in matchedPackages.slice(0, 100)" :key="group.key">
                                <td class="p-3">{{ group.channelName }}</td>
                                <td class="p-3 font-medium">{{ group.orderId }}</td>
                                <td class="p-3">{{ group.packageId || group.trackingNumber || '—' }}</td>
                                <td class="p-3">{{ formatDate(group.shippedAt) }}</td>
                                <td class="p-3"><div v-for="(item, itemIndex) in group.items" :key="item.sku + '-' + itemIndex" class="mb-1 last:mb-0">{{ formatPackageItem(item) }}</div></td>
                                <td class="p-3">{{ formatCurrency(group.totalHpp) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-if="matchedPackages.length > 100" class="p-3 text-xs text-slate-500">Pratinjau menampilkan 100 pesanan pertama yang cocok.</p>
                </div>

                <div v-if="importError" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ importError }}</div>
                <div v-if="importMessage" class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ importMessage }}</div>

                <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p v-if="importDisabledReason" class="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{{ importDisabledReason }}</p>
                    <p class="max-w-2xl text-xs text-slate-500">Baris bermasalah menghentikan seluruh impor agar data tidak masuk setengah-setengah. Pesanan yang pernah tercatat akan dilewati sebagai duplikat.</p>
                    <button type="button" @click="importPackages" :disabled="!canImport" class="rounded-lg bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {{ isImporting ? 'Mengimpor…' : 'Impor pesanan yang cocok' }}
                    </button>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import { db } from '../firebase.js';
import { collection, doc, getDoc, getDocs, increment, query, where, writeBatch } from 'firebase/firestore';

const props = defineProps({
    products: { type: Array, default: () => [] },
    marketplaces: { type: Array, default: () => [] },
    userId: { type: String, default: '' },
    subscriptionActive: { type: Boolean, default: true }
});
const emit = defineEmits(['completed']);

const fileInput = ref(null);
const scanInput = ref(null);
const scanInputValue = ref('');
const scanChannelId = ref('');
const shipmentChannelId = ref('');
const scanQueue = ref([]);
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

const scanStorageKey = computed(() => `fashion-os-package-scan-queue:${props.userId || 'anonymous'}`);
const matchedPackages = computed(() => packages.value.filter(group => scanQueue.value.some(scan => scanMatchesGroup(group, scan))));
const ambiguousScans = computed(() => scanQueue.value.filter(scan =>
    matchedPackages.value.filter(group => scanMatchesGroup(group, scan)).length > 1
));
const canImport = computed(() =>
    !isImporting.value &&
    props.subscriptionActive &&
    Boolean(props.userId) &&
    matchedPackages.value.length > 0 &&
    rowErrors.value.length === 0 &&
    ambiguousScans.value.length === 0
);
const importDisabledReason = computed(() => {
    if (isImporting.value) return 'Impor sedang berjalan. Tunggu sampai proses selesai.';
    if (!props.userId) return 'Akun belum siap atau sesi sudah berakhir. Muat ulang halaman dan pastikan Anda sudah masuk.';
    if (!props.subscriptionActive) return 'Langganan Fashion OS tidak aktif atau belum terbaca. Karena itu impor masih dikunci; status ini berbeda dari paket Blaze Firebase.';
    if (rowErrors.value.length) return 'Impor dikunci karena ada ' + rowErrors.value.length + ' baris bermasalah. Periksa pesan kesalahan di atas.';
    if (ambiguousScans.value.length) return 'Ada ID scan yang cocok dengan lebih dari satu paket. Gunakan ID paket atau resi agar tidak salah memilih.';
    if (!matchedPackages.value.length) return 'Belum ada ID scan yang cocok dengan file. Pastikan marketplace pilihan sama dan ID ada di file ekspor.';
    return '';
});
onMounted(() => {
    loadScanQueue();
    if (props.marketplaces.length) {
        if (!scanChannelId.value) scanChannelId.value = props.marketplaces[0].id;
        if (!shipmentChannelId.value) shipmentChannelId.value = props.marketplaces[0].id;
    }
});
watch(() => props.userId, loadScanQueue);
watch(scanQueue, queue => {
    if (!props.userId) return;
    try { localStorage.setItem(scanStorageKey.value, JSON.stringify(queue)); } catch (error) { console.warn('Antrean scan tidak dapat disimpan:', error); }
}, { deep: true });

const normalizeHeader = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const headerAliases = {
    channel: ['channel', 'marketplace', 'platform', 'nama marketplace', 'nama channel'],
    orderId: ['id pesanan', 'id pesanan marketplace', 'no pesanan', 'nomor pesanan', 'order id', 'orderid', 'order sn', 'ordersn'],
    packageId: ['id paket', 'package id', 'packageid', 'package sn', 'packagesn', 'shipment id', 'nomor paket'],
    trackingNumber: ['no resi', 'nomor resi', 'resi', 'tracking id', 'tracking number', 'tracking no', 'awb'],
    shippedAt: ['tanggal terkirim', 'tanggal dikirim', 'waktu dikirim', 'shipped time', 'waktu pengiriman diatur', 'waktu pengiriman', 'waktu pesanan selesai', 'tanggal pengiriman'],
    sku: ['sku', 'seller sku', 'nomor referensi sku', 'sku penjual', 'kode sku'],
    platformSkuId: ['sku id', 'platform sku id'],
    productName: ['product name', 'nama produk', 'nama barang'],
    variation: ['variation', 'nama variasi', 'variasi'],
    qty: ['qty', 'quantity', 'jumlah', 'kuantitas', 'jumlah produk', 'sku quantity', 'sku sold quantity', 'sku sold qty', 'item quantity', 'product quantity', 'jumlah barang', 'jumlah produk terjual'],
    unitPrice: ['sku unit original price', 'unit original price', 'harga satuan asli sku'],
    subtotalBeforeDiscount: ['sku subtotal before discount', 'subtotal before discount sku', 'subtotal sebelum diskon sku'],
    returnType: ['cancelation/return type', 'cancellation/return type', 'cancel return type', 'jenis pembatalan pengembalian'],
    status: ['status', 'order status', 'status pesanan', 'status pengiriman', 'status paket']
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
    'terkirim', 'dikirim', 'sudahdikirim', 'pesanandikirim', 'sedangdikirim', 'shipped',
    'intransit', 'dalampengiriman', 'awaitingcollection', 'delivered', 'selesai', 'completed'
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

function findMasterProduct({ sellerSku, platformSkuId, productName, variation }) {
    const norm = normalizeKey;
    const skuKeys = [sellerSku, platformSkuId].filter(Boolean).map(norm);
    const fields = product => [
        product.sku, product.sellerSku, product.marketplaceSku, product.externalSku,
        product.model_id, product.modelId, product.tiktokSkuId, product.shopeeSkuId
    ].filter(Boolean).map(norm);
    const direct = props.products.filter(product => fields(product).some(key => skuKeys.includes(key)));
    if (direct.length === 1) return direct[0];
    const sourceNames = [sellerSku, productName].filter(Boolean).map(norm);
    const nameMatches = props.products.filter(product => [
        product.nama, product.namaModel, product.namaProduk, product.product_name, product.modelName, product.nama_model
    ].filter(Boolean).map(norm).some(name => sourceNames.includes(name)));
    const variationKey = norm(variation);
    const variantMatches = nameMatches.filter(product => {
        const partKeys = [product.warna, product.color, product.varian, product.variant, product.ukuran, product.size]
            .filter(Boolean).map(norm);
        return !variationKey || partKeys.length === 0 || partKeys.some(part => variationKey.includes(part));
    });
    if (variantMatches.length === 1) return variantMatches[0];
    if (nameMatches.length === 1) return nameMatches[0];
    return null;
}

function loadScanQueue() {
    if (!props.userId) { scanQueue.value = []; return; }
    try {
        const saved = JSON.parse(localStorage.getItem(scanStorageKey.value) || '[]');
        scanQueue.value = Array.isArray(saved) ? saved.filter(scan => scan?.value && scan?.channelId) : [];
    } catch { scanQueue.value = []; }
}

function queueScannedValues(values) {
    const marketplace = props.marketplaces.find(item => item.id === scanChannelId.value);
    const cleanedValues = Array.from(new Set(values.map(cleanText).filter(Boolean)));
    if (!marketplace) {
        importError.value = 'Pilih marketplace yang sesuai sebelum menempel atau scan ID.';
        return { added: 0, duplicates: cleanedValues.length };
    }
    let added = 0;
    let duplicates = 0;
    const knownIds = new Set(scanQueue.value
        .filter(scan => scan.channelId === marketplace.id)
        .map(scan => normalizeKey(scan.value)));
    cleanedValues.forEach(value => {
        const key = normalizeKey(value);
        if (!key || knownIds.has(key)) {
            duplicates += 1;
            return;
        }
        knownIds.add(key);
        scanQueue.value.push({
            id: `scan-${Date.now()}-${added}-${Math.random().toString(36).slice(2, 8)}`,
            value, channelId: marketplace.id, channelName: marketplace.name, scannedAt: new Date().toISOString()
        });
        added += 1;
    });
    importError.value = '';
    importMessage.value = added
        ? added + ' ID berhasil ditambahkan' + (duplicates ? '; ' + duplicates + ' ID duplikat dilewati.' : '.')
        : 'Tidak ada ID baru yang ditambahkan; ID tersebut sudah ada di antrean.';
    return { added, duplicates };
}

function addScannedPackage() {
    const value = cleanText(scanInputValue.value);
    if (!value) return;
    queueScannedValues([value]);
    scanInputValue.value = '';
    nextTick(() => scanInput.value?.focus());
}

function pasteScannedPackages(event) {
    const pastedText = event.clipboardData?.getData('text');
    if (!pastedText) return;
    event.preventDefault();
    const values = pastedText
        .split(/[\r\n\t,;]+/)
        .map(cleanText)
        .filter(value => value && !['idpesanan', 'orderid', 'marketplaceorderid'].includes(normalizeKey(value)));
    queueScannedValues(values);
    scanInputValue.value = '';
    nextTick(() => scanInput.value?.focus());
}

function removeScan(scanId) {
    scanQueue.value = scanQueue.value.filter(scan => scan.id !== scanId);
}

function clearScanQueue() {
    if (window.confirm('Hapus semua ID pesanan dari antrean scan di browser ini?')) scanQueue.value = [];
}

function scanMatchesGroup(group, scan) {
    if (normalizeKey(group.channelId) !== normalizeKey(scan.channelId)) return false;
    const scanned = normalizeKey(scan.value);
    return [group.orderId, ...(group.packageIds || []), ...(group.trackingNumbers || [])]
        .filter(Boolean).some(identifier => normalizeKey(identifier) === scanned);
}

function formatScanDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatPackageItem(item) {
    const color = cleanText(item?.warna || item?.color);
    const size = cleanText(item?.ukuran || item?.size || item?.varian || item?.variant);
    const variation = cleanText(item?.variasiEkspor || item?.variation);
    const details = [];
    if (color) details.push('Warna: ' + color);
    if (size && normalizeKey(size) !== normalizeKey(color)) details.push('Ukuran: ' + size);

    if (variation) {
        const variationParts = variation.split(/[,|/]+/).map(cleanText).filter(Boolean).map(normalizeKey);
        const explicitParts = [color, size].filter(Boolean).map(normalizeKey);
        const alreadyRepresented = variationParts.length > 0 && variationParts.every(part =>
            explicitParts.some(explicit => explicit === part || explicit.includes(part) || part.includes(explicit))
        );
        if (!alreadyRepresented) details.push('Variasi ekspor: ' + variation);
    }

    const suffix = details.length ? ' · ' + details.join(' · ') : '';
    return item.nama + suffix + ' (' + item.qty + ' pcs)';
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
        selectedSheet.value = parsedBook.SheetNames.find(name => normalizeKey(name) === 'orderskuList'.toLowerCase()) || parsedBook.SheetNames.find(name => normalizeKey(name) === 'orders') || parsedBook.SheetNames[0];
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
    const usableRecords = records.filter(row => Object.values(row).some(value => cleanText(value)));
    if (!usableRecords.length) {
        fileError.value = 'File ekspor ini kosong. Pilih periode dan status Dikirim yang berisi pesanan.';
        return;
    }
    const headers = Object.keys(usableRecords[0]);
    const columns = Object.fromEntries(Object.keys(headerAliases).map(field => [field, findColumn(headers, field)]));
    const marketplaceSelected = props.marketplaces.find(item => item.id === shipmentChannelId.value);
    const required = ['orderId', 'sku', 'status'];
    const missing = required.filter(field => !columns[field]);
    const canDeriveQuantity = Boolean(columns.unitPrice && columns.subtotalBeforeDiscount);
    if (!columns.qty && !canDeriveQuantity) missing.push('qty');
    if (!columns.channel && !marketplaceSelected) missing.unshift('channel');
    if (missing.length) {
        fileError.value = 'Kolom wajib belum ditemukan: ' + missing.map(field => ({
            channel: 'pilih Marketplace', orderId: 'ID Pesanan', sku: 'Seller SKU/nomor SKU',
            qty: 'Quantity/Jumlah atau SKU Unit Original Price + SKU Subtotal Before Discount', status: 'Order Status/Status Pesanan'
        }[field])).join(', ') + '. Pastikan memakai ekspor dari menu Pesanan.';
        return;
    }
    const grouped = new Map();
    usableRecords.forEach((row, index) => {
        const rowNumber = index + 2;
        const channelText = cleanText(cellValue(row, columns.channel)) || marketplaceSelected?.name || '';
        const channel = channelFor(channelText);
        const orderId = cleanText(cellValue(row, columns.orderId));
        const packageId = cleanText(cellValue(row, columns.packageId));
        const trackingNumber = cleanText(cellValue(row, columns.trackingNumber));
        const sellerSku = cleanText(cellValue(row, columns.sku));
        const platformSkuId = cleanText(cellValue(row, columns.platformSkuId));
        const productName = cleanText(cellValue(row, columns.productName));
        const variationColumnIndex = columns.variation ? headers.indexOf(columns.variation) : -1;
        const variationContinuationColumns = variationColumnIndex >= 0
            ? headers.slice(variationColumnIndex + 1).filter(header => /^__EMPTY(?:_\d+)?$/i.test(String(header || '')))
            : [];
        const variation = [cellValue(row, columns.variation), ...variationContinuationColumns.map(column => cellValue(row, column))]
            .map(cleanText).filter(Boolean).join(', ');
        const skuForLookup = sellerSku || platformSkuId;
        const directQtyText = cleanText(cellValue(row, columns.qty));
        const parseExportNumber = value => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
            let text = cleanText(value).replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
            if (!text) return NaN;
            const comma = text.lastIndexOf(',');
            const dot = text.lastIndexOf('.');
            if (comma >= 0 && dot >= 0) {
                const decimalSeparator = comma > dot ? ',' : '.';
                const groupingSeparator = decimalSeparator === ',' ? /\./g : /,/g;
                text = text.replace(groupingSeparator, '').replace(decimalSeparator, '.');
            } else if (comma >= 0 || dot >= 0) {
                const separator = comma >= 0 ? ',' : '.';
                const parts = text.split(separator);
                if (parts.length === 2 && parts[1].length === 3) text = parts.join('');
                else text = parts.join('.');
            }
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : NaN;
        };
        let qtyValue = directQtyText ? parseExportNumber(directQtyText) : NaN;
        if ((!Number.isInteger(qtyValue) || qtyValue <= 0) && !directQtyText && canDeriveQuantity) {
            const unitPrice = parseExportNumber(cellValue(row, columns.unitPrice));
            const subtotal = parseExportNumber(cellValue(row, columns.subtotalBeforeDiscount));
            if (unitPrice > 0 && subtotal > 0) {
                const ratio = subtotal / unitPrice;
                const roundedRatio = Math.round(ratio);
                if (roundedRatio > 0 && Math.abs(ratio - roundedRatio) < 0.000001) qtyValue = roundedRatio;
            }
        }
        const status = normalizeKey(cellValue(row, columns.status));
        const returnType = cleanText(cellValue(row, columns.returnType));
        const shippedAt = parseDate(cellValue(row, columns.shippedAt));
        if (!shippedStatusTokens.has(status)) return;
        const rowIdentifiers = [orderId, packageId, trackingNumber].filter(Boolean).map(normalizeKey);
        const wasScanned = scanQueue.value.some(scan =>
            normalizeKey(scan.channelId) === normalizeKey(channel?.id || '') &&
            rowIdentifiers.includes(normalizeKey(scan.value))
        );
        if (!wasScanned) return;
        if (returnType) {
            rowErrors.value.push({ key: 'row-' + rowNumber, row: rowNumber, message: 'Baris pesanan memiliki status pembatalan/retur (' + returnType + '); periksa melalui alur retur sebelum impor.' });
            return;
        }
        const product = findMasterProduct({ sellerSku, platformSkuId, productName, variation });
        const issues = [];
        if (!channel) issues.push('Marketplace tidak cocok dengan pilihan');
        if (!orderId) issues.push('ID Pesanan kosong');
        if (!skuForLookup && !productName) issues.push('Seller SKU dan Nama Produk kosong');
        if (!Number.isInteger(qtyValue) || qtyValue <= 0) issues.push(!directQtyText && canDeriveQuantity
            ? 'Jumlah tidak bisa dihitung dengan pasti dari harga satuan dan subtotal'
            : 'Jumlah harus bilangan bulat lebih dari 0');
        if (!shippedStatusTokens.has(status)) issues.push('Status pesanan bukan Dikirim/Terkirim/Selesai');
        if (!product) issues.push('Produk/variasi belum cocok dengan master Fashion OS. Samakan Seller SKU atau nama produk dan variasi.');
        else if (!(product.docId || product.id)) issues.push('ID dokumen produk tidak tersedia; muat ulang master produk');
        else if (!(Number(product.hpp) > 0)) issues.push('HPP produk belum diisi atau masih 0');
        if (issues.length) {
            rowErrors.value.push({ key: 'row-' + rowNumber, row: rowNumber, message: issues.join('; ') });
            return;
        }
        const key = [channel.id, orderId, packageId || trackingNumber].map(normalizeKey).join('|');
        if (!grouped.has(key)) grouped.set(key, {
            key, channelId: channel.id, channelName: channel.name, orderId,
            packageIds: [], trackingNumbers: [], shippedAt: shippedAt || null, itemsByProduct: new Map()
        });
        const group = grouped.get(key);
        if (packageId && !group.packageIds.some(value => normalizeKey(value) === normalizeKey(packageId))) group.packageIds.push(packageId);
        if (trackingNumber && !group.trackingNumbers.some(value => normalizeKey(value) === normalizeKey(trackingNumber))) group.trackingNumbers.push(trackingNumber);
        if (!group.shippedAt && shippedAt) group.shippedAt = shippedAt;
        const productKey = [product.docId || product.id || product.sku, variation].map(normalizeKey).join('|');
        if (group.itemsByProduct.has(productKey)) group.itemsByProduct.get(productKey).qty += qtyValue;
        else group.itemsByProduct.set(productKey, {
            sku: product.sku || sellerSku || platformSkuId,
            platformSellerSku: sellerSku,
            platformSkuId,
            qty: qtyValue,
            hpp: Number(product.hpp) || 0,
            docId: product.docId || product.id || '',
            nama: product.nama || product.namaModel || product.product_name || productName || sellerSku || 'Produk',
            warna: product.warna || product.color || '',
            ukuran: product.ukuran || product.size || product.variant || product.varian || '',
            varian: product.ukuran || product.size || product.variant || product.varian || '',
            variasiEkspor: variation || '',
            model_id: product.model_id || product.modelId || ''
        });
    });
    packages.value = Array.from(grouped.values()).map(group => {
        const items = Array.from(group.itemsByProduct.values());
        return {
            ...group,
            items,
            packageId: group.packageIds[0] || '',
            trackingNumber: group.trackingNumbers[0] || '',
            totalHpp: items.reduce((sum, item) => sum + item.hpp * item.qty, 0)
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
        const selectedPackages = matchedPackages.value;
        if (ambiguousScans.value.length) throw new Error('Satu ID scan cocok dengan beberapa paket. Gunakan ID Paket atau No Resi untuk membedakannya.');
        const batchId = 'MARKETPLACE-SHIPMENT-' + Date.now();
        const existing = await fetchExistingTransactions(selectedPackages.map(group => group.orderId));
        const duplicates = [];
        const repairs = [];
        const ambiguous = [];
        const needsLegacyStatusRepair = transaction =>
            transaction?.inputSource === 'marketplace_shipped_export' &&
            normalizeKey(transaction.statusPencairan) === 'sudahcair' &&
            transaction.konfirmasiSuksesCairManual !== true &&
            normalizeKey(transaction.statusDataMarketplace) !== 'cocok';

        const toImport = selectedPackages.filter(group => {
            const matchingOrders = existing.filter(transaction =>
                normalizeKey(transaction.marketplaceOrderId) === normalizeKey(group.orderId) &&
                (normalizeKey(transaction.channelId) === normalizeKey(group.channelId) || normalizeKey(transaction.channel) === normalizeKey(group.channelName))
            );
            const pkgKey = normalizeKey(group.packageId || group.trackingNumber);
            const exactPackage = pkgKey
                ? matchingOrders.find(transaction =>
                    normalizeKey(transaction.externalPackageId || transaction.trackingNumber) === pkgKey
                )
                : null;
            if (exactPackage) {
                const hasCurrentShipmentData =
                    exactPackage.inputSource === 'marketplace_shipped_export' &&
                    Boolean(exactPackage.statusDataMarketplace) &&
                    Array.isArray(exactPackage.items) &&
                    exactPackage.items.length > 0;
                if (hasCurrentShipmentData && !needsLegacyStatusRepair(exactPackage)) duplicates.push(group);
                else repairs.push({ group, transaction: exactPackage, resetUnconfirmedPaid: needsLegacyStatusRepair(exactPackage) });
                return false;
            }
            if (!pkgKey && matchingOrders.length) {
                const existingTransaction = matchingOrders[0];
                const hasCurrentShipmentData =
                    existingTransaction.inputSource === 'marketplace_shipped_export' &&
                    Boolean(existingTransaction.statusDataMarketplace) &&
                    Array.isArray(existingTransaction.items) &&
                    existingTransaction.items.length > 0;
                if (hasCurrentShipmentData && !needsLegacyStatusRepair(existingTransaction)) duplicates.push(group);
                else repairs.push({ group, transaction: existingTransaction, resetUnconfirmedPaid: needsLegacyStatusRepair(existingTransaction) });
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

        const paidStatusRepairs = repairs.filter(item => item.resetUnconfirmedPaid);
        const stockRepairNeeded = paidStatusRepairs.some(item => item.transaction.stockDeductionApplied !== true);
        if (stockRepairNeeded && !window.confirm('Pesanan ini tersimpan sebagai “Dana dilepas” tanpa konfirmasi manual. Fashion OS akan mengembalikannya ke “Belum Cair” dan mengurangi stok untuk pesanan ini satu kali. Lanjutkan?')) {
            return;
        }

        let repairedCount = 0;
        const repairChunkSize = 25;
        for (let offset = 0; offset < repairs.length; offset += repairChunkSize) {
            const chunk = repairs.slice(offset, offset + repairChunkSize);
            const batch = writeBatch(db);
            const stockRepairDeltas = new Map();
            const repaired = chunk.map(({ group, transaction, resetUnconfirmedPaid }) => {
                const repairData = {
                    marketplaceOrderId: group.orderId,
                    externalPackageId: group.packageId || transaction.externalPackageId || '',
                    externalPackageIds: group.packageIds || transaction.externalPackageIds || [],
                    trackingNumber: group.trackingNumber || transaction.trackingNumber || '',
                    trackingNumbers: group.trackingNumbers || transaction.trackingNumbers || [],
                    tanggal: transaction.tanggal || group.shippedAt || new Date(),
                    tanggalTerkirim: group.shippedAt || transaction.tanggalTerkirim || transaction.tanggal || null,
                    inputSource: 'marketplace_shipped_export',
                    importBatchId: transaction.importBatchId || batchId,
                    items: group.items.map(item => ({
                        sku: item.sku,
                        qty: item.qty,
                        hpp: item.hpp,
                        model_id: item.model_id,
                        nama: item.nama,
                        warna: item.warna,
                        ukuran: item.ukuran,
                        varian: item.varian,
                        variasiEkspor: item.variasiEkspor
                    })),
                    totalHpp: group.totalHpp,
                    statusDataMarketplace: transaction.statusDataMarketplace || 'menunggu_data',
                    penghasilanBersihMarketplace: transaction.penghasilanBersihMarketplace ?? null,
                    channel: group.channelName,
                    channelId: group.channelId,
                    statusPencairan: resetUnconfirmedPaid ? 'Belum Cair' : (transaction.statusPencairan || 'Belum Cair'),
                    ...(resetUnconfirmedPaid ? { tanggalPencairan: null, konfirmasiSuksesCairManual: false } : {}),
                    userId: props.userId
                };
                if (resetUnconfirmedPaid && transaction.stockDeductionApplied !== true) {
                    group.items.forEach(item => {
                        if (item.docId) stockRepairDeltas.set(item.docId, (stockRepairDeltas.get(item.docId) || 0) + item.qty);
                    });
                    repairData.stockDeductionApplied = true;
                }
                batch.update(doc(db, 'transactions', transaction.id), repairData);
                return { ...transaction, ...repairData, id: transaction.id };
            });
            for (const [productId, qty] of stockRepairDeltas) {
                const productRef = doc(db, 'products', productId);
                const productSnapshot = await getDoc(productRef);
                if (!productSnapshot.exists()) throw new Error('Produk untuk koreksi stok tidak ditemukan: ' + productId);
                const productData = productSnapshot.data() || {};
                const currentStock = Number(productData.physical_stock ?? productData.stokFisik) || 0;
                const nextStock = currentStock - qty;
                const stockUpdate = { physical_stock: nextStock };
                if (Object.prototype.hasOwnProperty.call(productData, 'stokFisik')) stockUpdate.stokFisik = nextStock;
                batch.update(productRef, stockUpdate);
            }
            await batch.commit();
            repairedCount += repaired.length;
            emit('completed', { transactions: repaired, stockDeltas: {} });
        }

        if (!toImport.length) {
            if (repairedCount) {
                importMessage.value = repairedCount + ' transaksi lama diperbarui. Status pencairan tanpa konfirmasi manual dikembalikan ke Belum Cair; koreksi stok hanya dilakukan satu kali.';
            } else {
                importMessage.value = 'Semua pesanan yang cocok sudah pernah diimpor dan datanya sudah lengkap. Tidak ada transaksi atau pengurangan stok baru.';
            }
            const completedKeys = new Set([...duplicates, ...repairs.map(item => item.group)].map(group => group.key));
            scanQueue.value = scanQueue.value.filter(scan => !selectedPackages.some(group => completedKeys.has(group.key) && scanMatchesGroup(group, scan)));
            return;
        }

        const shortages = stockShortages(toImport);
        if (shortages.length) {
            const details = shortages.slice(0, 8).map(item => `${item.name}: stok ${item.stock}, akan dikirim ${item.qty}`).join('\n');
            if (!window.confirm('Stok Fashion OS kurang untuk sebagian paket. Karena paket pada file sudah terkonfirmasi terkirim, impor akan tetap mencatat penjualan dan stok dapat menjadi minus.\n\n' + details + '\n\nLanjutkan impor?')) return;
        }

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
                    externalPackageIds: group.packageIds || [],
                    trackingNumber: group.trackingNumber || '',
                    trackingNumbers: group.trackingNumbers || [],
                    tanggal: group.shippedAt || new Date(),
                    tanggalTerkirim: group.shippedAt || null,
                    inputSource: 'marketplace_shipped_export',
                    importBatchId: batchId,
                    items: group.items.map(item => ({
                        sku: item.sku,
                        qty: item.qty,
                        hpp: item.hpp,
                        model_id: item.model_id,
                        nama: item.nama,
                        warna: item.warna,
                        ukuran: item.ukuran,
                        varian: item.varian,
                        variasiEkspor: item.variasiEkspor
                    })),
                    totalHpp: group.totalHpp,
                    statusDataMarketplace: 'menunggu_data',
                    penghasilanBersihMarketplace: null,
                    channel: group.channelName,
                    channelId: group.channelId,
                    statusPencairan: 'Belum Cair',
                    stockDeductionApplied: true,
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

        const messageParts = [];
        if (importedCount) messageParts.push(importedCount + ' paket baru berhasil diimpor.');
        if (repairedCount) messageParts.push(repairedCount + ' transaksi lama diperbarui dengan detail produk, ukuran, warna, dan HPP; stok tidak dikurangi lagi.');
        if (duplicates.length) messageParts.push(duplicates.length + ' paket lengkap dilewati sebagai duplikat tanpa mengurangi stok.');
        importMessage.value = messageParts.join(' ');
        const completedIds = new Set([...toImport, ...duplicates, ...repairs.map(item => item.group)].map(group => group.key));
        scanQueue.value = scanQueue.value.filter(scan => !selectedPackages.some(group => completedIds.has(group.key) && scanMatchesGroup(group, scan)));
    } catch (error) {
        console.error('Gagal mengimpor pesanan terkirim:', error);
        importError.value = error?.message || 'Impor gagal. Tidak ada perubahan yang berhasil diproses pada paket terakhir.';
    } finally {
        isImporting.value = false;
    }
}
</script>
