<template>
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
            <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">Konfirmasi dana</p>
            <h2 class="mt-1 text-xl font-bold text-slate-900">Konfirmasi Pesanan Berhasil</h2>
            <p class="mt-2 max-w-3xl text-sm text-slate-600">
                Pilih marketplace atau toko, tempel ID pesanan yang sudah kamu pastikan berhasil cair, lalu cocokkan dengan transaksi di Fashion OS. Tidak perlu mengunggah file penghasilan.
            </p>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
            <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">Marketplace / nama toko</span><select v-model="selectedMarketplaceId" class="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="">Pilih marketplace / toko</option><option v-for="marketplace in marketplaces" :key="marketplace.id" :value="marketplace.id">{{ marketplace.name }}</option></select></label>
            <p class="self-end rounded-lg bg-amber-50 p-3 text-xs text-amber-900">ID yang tidak ditempel tetap berstatus belum selesai. Fashion OS tidak menebak nilai penghasilan per pesanan dari ID saja.</p>
        </div>
        <p v-if="!selectedMarketplaceId" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pilih marketplace / nama toko di atas terlebih dahulu agar tombol pemeriksaan dan penyimpanan pencairan aktif.</p>

        <div class="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 class="font-bold text-slate-900">Konfirmasi ID pesanan sukses cair</h3>
            <p class="mt-1 text-xs text-slate-600">Salin ID yang sudah kamu saring di Excel, satu ID per baris atau pisahkan dengan koma. ID yang tidak ditempel akan tetap tertunda.</p>
            <textarea v-model="pastedOrderIds" rows="5" placeholder="2606131H28BE73&#10;260614421BP6GG" class="mt-3 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm"></textarea>
            <button type="button" @click="prepareConfirmedIds" :disabled="isPreparing || !pastedOrderIds.trim() || !selectedMarketplaceId" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:bg-slate-300">
                {{ isPreparing ? 'Memeriksa…' : 'Periksa ID di Fashion OS' }}
            </button>
            <p v-if="manualError" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ manualError }}</p>
            <div v-if="manualRows.length" class="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table class="w-full min-w-[560px] text-left text-sm">
                    <thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">ID Pesanan</th><th class="p-3">Transaksi</th><th class="p-3">HPP yang cocok</th><th class="p-3">Hasil</th></tr></thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="row in manualRows" :key="row.id">
                            <td class="p-3 font-mono">{{ row.orderId }}</td><td class="p-3">{{ row.transactions.length }}</td>
                            <td class="p-3">{{ formatCurrency(row.hpp) }}</td>
                            <td class="p-3" :class="row.error ? 'text-red-700' : 'text-emerald-700'">{{ row.error || (row.alreadySettled ? 'Sudah dikonfirmasi' : 'Siap dikonfirmasi') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-if="manualRows.length" class="mt-3 text-xs text-slate-500">Konfirmasi ID mengubah status saja. Penghasilan/laba periode dihitung setelah total dana dilepas dicatat pada kotak di bawah.</p>
            <button v-if="manualRows.length" type="button" @click="saveConfirmedIds" :disabled="isSavingManual || manualRows.some(row => row.error) || manualRows.every(row => row.alreadySettled)" class="mt-4 rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white disabled:bg-slate-300">
                {{ isSavingManual ? 'Menyimpan…' : 'Konfirmasi dana sudah dilepas' }}
            </button>
            <div class="mt-5 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                <h3 class="font-semibold text-slate-900">Catat total pencairan periode (tanpa unggah file)</h3>
                <p class="mt-1 text-xs text-slate-600">Masukkan nilai “Total yang Dilepas” dari ringkasan marketplace. Nilai baru masuk ke dashboard dan laporan setelah tombol simpan ditekan. Simpan satu kali untuk toko dan periode yang sama; nilai tidak dibagi ke tiap pesanan.</p>
                <div class="mt-3 grid gap-3 sm:grid-cols-3">
                    <label class="block"><span class="mb-1 block text-xs">Periode mulai</span><input v-model="payoutPeriodStart" type="date" class="w-full rounded-lg border p-2 text-sm"></label>
                    <label class="block"><span class="mb-1 block text-xs">Periode selesai</span><input v-model="payoutPeriodEnd" type="date" class="w-full rounded-lg border p-2 text-sm"></label>
                    <label class="block"><span class="mb-1 block text-xs">Total dana dilepas (Rp)</span><input v-model="payoutAmount" type="number" min="0" step="1" class="w-full rounded-lg border p-2 text-sm" placeholder="Contoh: 3345930"></label>
                </div>
                <button type="button" @click="savePayoutSummary" :disabled="isSavingPayout || !selectedMarketplaceId || !payoutAmount || Number(payoutAmount) <= 0 || payoutPeriodStart > payoutPeriodEnd" class="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{{ isSavingPayout ? 'Menyimpan…' : 'Simpan total pencairan periode' }}</button>
                <div v-if="manualRows.length && payoutAmount && !manualRows.some(row => row.error)" class="mt-4 rounded-lg border p-4" :class="Number(payoutAmount) - manualRows.reduce((sum,row) => sum + row.hpp,0) >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'">
                    <p class="text-xs font-bold uppercase tracking-wide">Pratinjau saja · belum tersimpan</p>
                    <p class="mt-1 text-sm font-semibold">Perkiraan selisih dana dilepas dikurangi HPP pesanan yang cocok</p>
                    <p class="mt-1 text-2xl font-bold" :class="Number(payoutAmount) - manualRows.reduce((sum,row) => sum + row.hpp,0) >= 0 ? 'text-emerald-700' : 'text-red-700'">{{ formatCurrency(Number(payoutAmount) - manualRows.reduce((sum,row) => sum + row.hpp,0)) }} · {{ Number(payoutAmount) - manualRows.reduce((sum,row) => sum + row.hpp,0) >= 0 ? 'Laba' : 'Rugi' }}</p>
                    <p class="mt-1 text-xs text-slate-600">Perkiraan ini benar jika semua ID sukses dari periode yang sama sudah diperiksa. Belum termasuk biaya operasional lain. Setelah tersimpan, perhitungan lengkap masuk ke Laporan Keuangan.</p>
                </div>
                <p v-if="payoutSummaryMessage" class="mt-3 rounded-lg bg-white p-3 text-sm text-emerald-800">{{ payoutSummaryMessage }}</p>
                <p v-if="payoutSummaryError" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ payoutSummaryError }}</p>
            </div>
            <p v-if="manualMessage" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ manualMessage }}</p>
        </div>

        <div class="mt-5 rounded-2xl border border-red-100 bg-white p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div><h3 class="font-bold text-slate-900">Pesanan belum terselesaikan</h3><p class="mt-1 text-sm text-slate-500">Kalender menandai tanggal transaksi yang masih menunggu konfirmasi dana.</p></div>
                <input type="month" v-model="calendarMonth" @change="selectFirstPendingDay" class="rounded-lg border border-slate-300 p-2 text-sm">
            </div>
            <div class="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500"><span v-for="day in weekDays" :key="day">{{ day }}</span></div>
            <div class="mt-1 grid grid-cols-7 gap-1">
                <button v-for="day in calendarDays" :key="day.key" type="button" @click="selectedPendingDay=day.key" :disabled="!day.key" class="min-h-12 rounded-lg border p-1 text-sm" :class="[day.inMonth ? 'border-slate-200 text-slate-800' : 'border-transparent text-slate-300', day.count ? 'bg-red-50 font-bold text-red-700' : 'bg-white', selectedPendingDay===day.key ? 'ring-2 ring-indigo-500' : '']">
                    <span>{{ day.number }}</span><span v-if="day.count" class="block text-[10px]">{{ day.count }} tertunda</span>
                </button>
            </div>
            <p v-if="pendingLoading" class="mt-3 text-sm text-slate-500">Memuat pesanan tertunda…</p>
            <div v-else class="mt-4">
                <h4 class="font-semibold text-slate-800">{{ selectedPendingDay || 'Pilih tanggal' }} · {{ selectedPendingTransactions.length }} pesanan</h4>
                <div v-if="selectedPendingTransactions.length" class="mt-2 divide-y rounded-lg border border-slate-200">
                    <div v-for="tx in selectedPendingTransactions" :key="tx.id" class="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div><p class="font-mono text-sm font-semibold">{{ tx.marketplaceOrderId || 'ID tidak tersedia' }}</p><p class="text-xs text-slate-500">{{ tx.channel || tx.channelId }} · HPP {{ formatCurrency(transactionHpp(tx)) }}</p></div>
                        <div class="flex gap-2"><button type="button" @click="markReturned(tx.marketplaceOrderId, tx.channelId)" class="rounded border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800">Konfirmasi retur</button><button type="button" @click="markLost(tx.marketplaceOrderId, tx.channelId)" class="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">Konfirmasi hilang</button></div>
                    </div>
                </div>
                <p v-else class="mt-2 text-sm text-slate-500">Tidak ada pesanan tertunda pada tanggal ini.</p>
                <p v-if="resolutionMessage" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ resolutionMessage }}</p>
                <p class="mt-3 text-xs text-slate-500">Konfirmasi retur hanya menutup penantian dana. Stok retur tetap harus dicatat manual di Manajemen Retur setelah barang kembali.</p>
            </div>
        </div>
    </section>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import { db } from '../firebase.js';
import { collection, getDocs, query, where, writeBatch, doc, setDoc } from 'firebase/firestore';

const props = defineProps({
    userId: { type: String, default: '' },
    marketplaces: { type: Array, default: () => [] },
    subscriptionActive: { type: Boolean, default: true }
});
const emit = defineEmits(['completed']);
const fileName = ref('');
const fileError = ref('');
const importError = ref('');
const importMessage = ref('');
const workbook = ref(null);
const sheetNames = ref([]);
const selectedSheet = ref('');
const selectedMarketplaceId = ref('');
watch(() => props.marketplaces, list => {
    if (!selectedMarketplaceId.value && Array.isArray(list) && list.length === 1) {
        selectedMarketplaceId.value = list[0].id;
    }
}, { immediate: true });
const rows = ref([]);
const rowErrors = ref([]);
const isSaving = ref(false);
const canSave = computed(() => !isSaving.value && !!props.userId && props.subscriptionActive && rows.value.length > 0 && rowErrors.value.length === 0);
const pastedOrderIds = ref('');
const manualRows = ref([]);
const manualError = ref('');
const manualMessage = ref('');
const isPreparing = ref(false);
const isSavingManual = ref(false);
const shopeeReport = ref(null);
const payoutAmount = ref('');
const payoutPeriodStart = ref(localDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
const payoutPeriodEnd = ref(localDateKey(new Date()));
const isSavingPayout = ref(false);
const payoutSummaryMessage = ref('');
const payoutSummaryError = ref('');
const pendingTransactions = ref([]);
const pendingLoading = ref(false);
const resolutionMessage = ref('');
const calendarMonth = ref(localDateKey(new Date()).slice(0, 7));
const selectedPendingDay = ref(localDateKey(new Date()));
const weekDays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const calendarDays = computed(() => {
    const [year, month] = calendarMonth.value.split('-').map(Number);
    if (!year || !month) return [];
    const first = new Date(year, month - 1, 1);
    const offset = first.getDay();
    const start = new Date(year, month - 1, 1 - offset);
    const counts = new Map();
    pendingTransactions.value.forEach(tx => {
        const key = pendingDateKey(tx);
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const key = localDateKey(date);
        return { key, number: date.getDate(), inMonth: date.getMonth() === month - 1, count: counts.get(key) || 0 };
    });
});
const selectedPendingTransactions = computed(() => pendingTransactions.value.filter(tx => pendingDateKey(tx) === selectedPendingDay.value));
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const money = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = text(value).replace(/\s/g, '').replace(/Rp/ig, '');
    if (!raw) return NaN;
    const negative = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return NaN;
    return (negative ? -1 : 1) * Number(digits);
};
const parseDate = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' && value > 0) {
        const d = XLSX.SSF.parse_date_code(value);
        if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
    }
    const raw = text(value);
    if (!raw) return null;
    const id = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (id) return new Date(+id[3], +id[2] - 1, +id[1], +(id[4] || 0), +(id[5] || 0), +(id[6] || 0));
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};
const marketplaceById = id => props.marketplaces.find(m => String(m.id) === String(id)) || null;
function matrix(sheet) { return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }); }
function headerIndex(data, required) {
    const wanted = required.map(norm);
    return data.findIndex(row => wanted.every(key => row.some(cell => norm(cell) === key)));
}
function headerRecords(sheet, required) {
    const data = matrix(sheet);
    const index = headerIndex(data, required);
    if (index < 0) return null;
    const headers = data[index].map(text);
    return data.slice(index + 1).map((values, i) => ({
        rowNumber: index + i + 2,
        values: Object.fromEntries(headers.map((header, col) => [header, values[col] ?? '']))
    }));
}
function col(headers, choices) {
    const keys = new Set(choices.map(norm));
    return headers.find(header => keys.has(norm(header)));
}
function amountFrom(record, header) { return header ? money(record[header]) : NaN; }
function chosenMarketplace(sourceName) {
    if (selectedMarketplaceId.value) return marketplaceById(selectedMarketplaceId.value);
    const key = norm(sourceName);
    return props.marketplaces.find(m => key.includes('tiktok') && norm(m.name).includes('tiktok')) ||
        props.marketplaces.find(m => key.includes('shopee') && norm(m.name).includes('shopee')) || null;
}
// eslint-disable-next-line no-unused-vars
function handleFile(event) {
    const file = event.target.files?.[0];
    fileError.value = ''; importError.value = ''; importMessage.value = '';
    rows.value = []; rowErrors.value = []; workbook.value = null;
    if (!file) return;
    fileName.value = file.name;
    file.arrayBuffer().then(buffer => {
        const parsed = XLSX.read(buffer, { type: 'array', cellDates: true });
        if (!parsed.SheetNames?.length) throw new Error('File tidak berisi tab yang bisa dibaca.');
        workbook.value = parsed;
        sheetNames.value = parsed.SheetNames;
        const preferred = parsed.SheetNames.find(n => norm(n) === 'penghasilan') ||
            parsed.SheetNames.find(n => norm(n).includes('detailpesanan')) ||
            parsed.SheetNames.find(n => norm(n) === 'siappenghasilan');
        selectedSheet.value = preferred || parsed.SheetNames[0];
        if (!selectedMarketplaceId.value) {
            const guessed = chosenMarketplace(file.name);
            selectedMarketplaceId.value = guessed?.id || '';
        }
        parseSelectedSheet();
    }).catch(error => { fileError.value = error.message || 'File gagal dibaca.'; });
}
function parseSelectedSheet() {
    fileError.value = ''; rows.value = []; rowErrors.value = []; importError.value = ''; importMessage.value = ''; shopeeReport.value = null;
    const sheet = workbook.value?.Sheets?.[selectedSheet.value];
    if (!sheet) return;
    const names = workbook.value?.SheetNames || [];
    if (names.some(name => norm(name) === 'summary') && names.some(name => norm(name) === 'sellerfee')) {
        parseShopeeReleasedReport(workbook.value);
        return;
    }
    const tab = norm(selectedSheet.value);
    if (tab.includes('detailpesanan')) return parseTikTok(sheet);
    if (tab === 'penghasilan') return parseShopee(sheet);
    parseGeneric(sheet);
}
function pushErrorsAndRows(parsed, errors) {
    rows.value = parsed;
    rowErrors.value = errors;
    if (!parsed.length && !errors.length) fileError.value = 'Tidak ditemukan baris penghasilan yang bisa dibaca pada tab ini.';
}
function parseTikTok(sheet) {
    const data = matrix(sheet);
    const index = data.findIndex(row => row.some(cell => ['idpesanan', 'idpesananpenyesuaian', 'orderid'].includes(norm(cell))) && row.some(cell => ['jumlahpenyelesaianpembayaran', 'settlementamount'].includes(norm(cell))));
    if (index < 0) { fileError.value = 'Tab TikTok harus memuat ID Pesanan dan Jumlah penyelesaian pembayaran.'; return; }
    const headersAtRow = data[index].map(text);
    const parsed = data.slice(index + 1).map((values, i) => ({ rowNumber: index + i + 2, values: Object.fromEntries(headersAtRow.map((header, colIndex) => [header, values[colIndex] ?? ''])) }));
    const sample = parsed.find(r => r.values['ID Pesanan'] && norm(r.values['ID Pesanan']) !== 'platformuniqueorderid')?.values || {};
    const headers = Object.keys(sample);
    const orderCol = col(headers, ['ID Pesanan', 'ID Pesanan/Penyesuaian', 'ID Pesanan / Penyesuaian', 'Order ID']);
    const relatedCol = col(headers, ['ID pesanan terkait', 'Related Order ID']);
    const netCol = col(headers, ['Jumlah penyelesaian pembayaran', 'Settlement Amount']);
    const grossCol = col(headers, ['Total Pendapatan', 'Total income']);
    const feeCol = col(headers, ['Total Biaya', 'Total fees']);
    const dateCol = col(headers, ['Tanggal Dana Dilepaskan', 'Tanggal Pencairan', 'Payout Date', 'Withdrawal Date']);
    const statusCol = col(headers, ['Status Pencairan', 'Payout Status', 'Status Dana']);
    const packageCol = col(headers, ['ID Paket', 'Package ID']);
    const trackingCol = col(headers, ['Nomor resi', 'Tracking ID', 'AWB']);
    const excluded = new Set([netCol, grossCol, feeCol]);
    const feeCols = headers.filter(h => !excluded.has(h) && /(biaya|fee|komisi|ongkir|pengiriman|pajak|shipping|commission)/i.test(h) && !/(total|jumlah keseluruhan)/i.test(h));
    const grouped = new Map();
    const errors = [];
    const channel = chosenMarketplace(fileName.value + ' ' + selectedSheet.value);
    if (!channel) { fileError.value = 'Pilih Shopee atau TikTok pada pilihan Marketplace sebelum memproses file.'; return; }
    parsed.forEach(({ rowNumber, values }) => {
        const rawId = text(values[orderCol]);
        if (!rawId || /platform unique order id/i.test(rawId)) return;
        const relatedId = text(relatedCol ? values[relatedCol] : '');
        const orderId = relatedId && !/^(\/|-|n\/a)$/i.test(relatedId) ? relatedId : rawId;
        const kind = norm(values[col(headers, ['Jenis transaksi', 'Transaction type'])] || '');
        if (kind && !['order', 'pesanan', 'settlement', 'adjustment', 'penyesuaian', 'refund', 'return', 'pengembalian', 'cancellation', 'pembatalan'].some(k => kind.includes(k))) return;
        const net = amountFrom(values, netCol);
        if (!Number.isFinite(net)) { errors.push({ key: 'tt-' + rowNumber, row: rowNumber, message: 'Jumlah penyelesaian pembayaran kosong/tidak valid untuk ID ' + orderId }); return; }
        const key = norm(orderId);
        const current = grouped.get(key) || { row: rowNumber, channelId: channel.id, channelName: channel.name, orderId, packageId: text(packageCol ? values[packageCol] : ''), trackingNumber: text(trackingCol ? values[trackingCol] : ''), netIncome: 0, grossIncome: 0, marketplaceFeesTotal: 0, feeMap: new Map(), paidAt: null, payoutStatus: 'Belum Cair', source: 'tiktok_income_export' };
        current.netIncome += net;
        const gross = amountFrom(values, grossCol);
        const fees = amountFrom(values, feeCol);
        if (Number.isFinite(gross)) current.grossIncome += gross;
        if (Number.isFinite(fees)) current.marketplaceFeesTotal += Math.abs(fees);
        feeCols.forEach(h => { const n = money(values[h]); if (Number.isFinite(n) && n !== 0) current.feeMap.set(h, (current.feeMap.get(h) || 0) + Math.abs(n)); });
        const dt = parseDate(dateCol ? values[dateCol] : '');
        const payoutStatusRaw = norm(statusCol ? values[statusCol] : '');
        if (dt && (!current.paidAt || dt < current.paidAt)) current.paidAt = dt;
        if (['sudahcair', 'paid', 'settled', 'released', 'withdrawn'].includes(payoutStatusRaw) || dt) current.payoutStatus = 'Sudah Cair';
        grouped.set(key, current);
    });
    const result = [...grouped.values()].map(x => ({ ...x, marketplaceFeeBreakdown: [...x.feeMap].map(([name, value]) => ({ name, value })), key: 'tt-' + norm(x.orderId) }));
    pushErrorsAndRows(result, errors);
}
function parseShopeeReleasedReport(book) {
    const summary = matrix(book.Sheets[book.SheetNames.find(name => norm(name) === 'summary')]);
    const seller = matrix(book.Sheets[book.SheetNames.find(name => norm(name) === 'sellerfee')]);
    const summaryValue = label => {
        const row = summary.find(values => values.some(cell => norm(cell) === norm(label)));
        return row ? row[row.findIndex(cell => norm(cell) === norm(label)) + 1] : '';
    };
    const totalRow = summary.find(values => values.some(cell => norm(cell).includes('totalyangdilepas')));
    const totalCell = totalRow ? [...totalRow].reverse().find(value => Number.isFinite(money(value))) : null;
    const totalReleased = totalCell === null ? NaN : money(totalCell);
    const periodStart = text(summaryValue('Dari'));
    const periodEnd = text(summaryValue('ke'));
    const headerAt = seller.findIndex(values => values.some(cell => norm(cell) === 'nopesanan'));
    const channel = chosenMarketplace(fileName.value + ' ' + selectedSheet.value);
    if (!channel) { fileError.value = 'Pilih Shopee pada pilihan Marketplace sebelum memproses file.'; return; }
    if (headerAt < 0) { fileError.value = 'Tab Seller Fee tidak memiliki kolom No. Pesanan.'; return; }
    const headers = seller[headerAt].map(text);
    const orderCol = headers.findIndex(header => norm(header) === 'nopesanan');
    const orderIds = seller.slice(headerAt + 1).map(row => text(row[orderCol])).filter(value => value && norm(value) !== 'nopesanan');
    if (!Number.isFinite(totalReleased)) { fileError.value = 'Tab Summary tidak memuat angka pada baris Total yang Dilepas.'; return; }
    shopeeReport.value = { channelId: channel.id, channelName: channel.name, totalReleased, periodStart, periodEnd, orderIds: [...new Set(orderIds)] };
    rows.value = [];
    rowErrors.value = [];
    importError.value = '';
}
function parseShopee(sheet) {
    const parsed = headerRecords(sheet, ['No. Pesanan', 'Total Penghasilan']);
    if (!parsed) { fileError.value = 'Tab Shopee harus memuat kolom No. Pesanan dan Total Penghasilan.'; return; }
    const records = parsed.filter(r => text(r.values['No. Pesanan']));
    const headers = Object.keys(records[0]?.values || {});
    const orderCol = col(headers, ['No. Pesanan', 'Order ID']);
    const viewCol = col(headers, ['Lihat berdasarkan', 'View by']);
    const netCol = col(headers, ['Total Penghasilan', 'Total income']);
    const grossCol = col(headers, ['Harga Produk', 'Product price']);
    const packageCol = col(headers, ['ID Paket', 'Package ID']);
    const trackingCol = col(headers, ['No. Resi', 'Nomor Resi', 'Tracking Number']);
    const paidCol = col(headers, ['Tanggal Dana Dilepaskan', 'Release Date']);
    const excluded = new Set([netCol, grossCol]);
    const feeCols = headers.filter(h => !excluded.has(h) && /(biaya|fee|komisi|ongkir|pengiriman|pajak|shipping|commission)/i.test(h) && !/(total biaya|total fee)/i.test(h));
    const channel = chosenMarketplace(fileName.value + ' ' + selectedSheet.value);
    if (!channel) { fileError.value = 'Pilih Shopee pada pilihan Marketplace sebelum memproses file.'; return; }
    const result = [], errors = [], seen = new Set();
    records.forEach(({ rowNumber, values }) => {
        if (viewCol && norm(values[viewCol]) !== 'order') return;
        const orderId = text(values[orderCol]);
        if (!orderId || norm(orderId) === 'orderid') return;
        const id = norm(orderId);
        if (seen.has(id)) { errors.push({ key: 'sp-' + rowNumber, row: rowNumber, message: 'ID pesanan duplikat pada baris Order: ' + orderId }); return; }
        seen.add(id);
        const netIncome = amountFrom(values, netCol);
        const grossIncome = amountFrom(values, grossCol);
        if (!Number.isFinite(netIncome)) { errors.push({ key: 'sp-' + rowNumber, row: rowNumber, message: 'Total Penghasilan kosong/tidak valid untuk ID ' + orderId }); return; }
        const breakdown = feeCols.map(name => ({ name, value: money(values[name]) })).filter(x => Number.isFinite(x.value) && x.value !== 0).map(x => ({ ...x, value: Math.abs(x.value) }));
        const feesCol = col(headers, ['Total Biaya', 'Total biaya penjual', 'Total Fees']);
        const totalFees = feesCol ? amountFrom(values, feesCol) : breakdown.reduce((sum, item) => sum + item.value, 0);
        const paidAt = parseDate(paidCol ? values[paidCol] : '');
        result.push({ key: 'sp-' + id, row: rowNumber, channelId: channel.id, channelName: channel.name, orderId, packageId: text(packageCol ? values[packageCol] : ''), trackingNumber: text(trackingCol ? values[trackingCol] : ''), netIncome, grossIncome: Number.isFinite(grossIncome) ? grossIncome : 0, marketplaceFeesTotal: Number.isFinite(totalFees) ? Math.abs(totalFees) : breakdown.reduce((sum, item) => sum + item.value, 0), marketplaceFeeBreakdown: breakdown, payoutStatus: paidAt ? 'Sudah Cair' : 'Belum Cair', paidAt, source: 'shopee_income_export' });
    });
    pushErrorsAndRows(result, errors);
}
function parseGeneric(sheet) {
    const parsed = headerRecords(sheet, ['ID Pesanan', 'Penghasilan Bersih']);
    if (!parsed) { fileError.value = 'Tab ini bukan laporan Penghasilan Shopee/TikTok yang dikenali.'; return; }
    const records = parsed.filter(r => text(r.values['ID Pesanan']));
    const headers = Object.keys(records[0]?.values || {});
    const orderCol = col(headers, ['ID Pesanan', 'Order ID']);
    const channelCol = col(headers, ['Channel', 'Marketplace']);
    const netCol = col(headers, ['Penghasilan Bersih']);
    const packageCol = col(headers, ['ID Paket', 'Package ID']);
    const trackingCol = col(headers, ['No Resi', 'No. Resi', 'Tracking Number']);
    const statusCol = col(headers, ['Status Pencairan', 'Payout Status']);
    const paidCol = col(headers, ['Tanggal Pencairan', 'Tanggal Cair', 'Payout Date']);
    const result = [], errors = [], seen = new Set();
    records.forEach(({ rowNumber, values }) => {
        const orderId = text(values[orderCol]);
        const channelText = text(channelCol ? values[channelCol] : '');
        const channel = channelText ? props.marketplaces.find(m => norm(m.name) === norm(channelText) || norm(m.id) === norm(channelText)) : chosenMarketplace(fileName.value);
        const netIncome = amountFrom(values, netCol);
        const id = [channel?.id || channelText, orderId, text(values[packageCol] || values[trackingCol])].map(norm).join('|');
        const messages = [];
        if (!channel) messages.push('Pilih marketplace yang sesuai');
        if (!orderId) messages.push('ID Pesanan kosong');
        if (!Number.isFinite(netIncome)) messages.push('Penghasilan Bersih kosong/tidak valid');
        if (seen.has(id)) messages.push('Baris penghasilan duplikat');
        seen.add(id);
        if (messages.length) { errors.push({ key: 'generic-' + rowNumber, row: rowNumber, message: messages.join('; ') }); return; }
        const paidAt = parseDate(paidCol ? values[paidCol] : '');
        const rawStatus = norm(statusCol ? values[statusCol] : '');
        const payoutStatus = ['sudahcair', 'paid', 'settled', 'cair'].includes(rawStatus) || (!rawStatus && paidAt) ? 'Sudah Cair' : 'Belum Cair';
        result.push({ key: id, row: rowNumber, channelId: channel.id, channelName: channel.name, orderId, packageId: text(packageCol ? values[packageCol] : ''), trackingNumber: text(trackingCol ? values[trackingCol] : ''), netIncome, grossIncome: 0, marketplaceFeesTotal: 0, marketplaceFeeBreakdown: [], payoutStatus, paidAt, source: 'generic_income_import' });
    });
    pushErrorsAndRows(result, errors);
}
// eslint-disable-next-line no-unused-vars
async function saveIncome() {
    if (!canSave.value) return;
    isSaving.value = true; importError.value = ''; importMessage.value = '';
    try {
        const ids = [...new Set(rows.value.map(row => row.orderId))], existing = [];
        for (let offset = 0; offset < ids.length; offset += 30) {
            const snap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', props.userId), where('marketplaceOrderId', 'in', ids.slice(offset, offset + 30))));
            snap.docs.forEach(item => existing.push({ id: item.id, ...item.data() }));
        }
        const mapped = [], errors = [];
        rows.value.forEach(row => {
            const matches = existing.filter(tx => norm(tx.marketplaceOrderId) === norm(row.orderId) && (norm(tx.channelId) === norm(row.channelId) || norm(tx.channel) === norm(row.channelName)));
            const packageKey = norm(row.packageId || row.trackingNumber);
            let match = null;
            if (packageKey) {
                const byPackage = matches.filter(tx => norm(tx.externalPackageId) === packageKey || norm(tx.trackingNumber) === packageKey);
                if (byPackage.length === 1) match = byPackage[0];
                else if (byPackage.length > 1) errors.push('Baris ' + row.row + ': ID Paket/Resi cocok ke lebih dari satu transaksi.');
            } else if (matches.length === 1) match = matches[0];
            else if (matches.length > 1) errors.push('Baris ' + row.row + ': pesanan punya beberapa paket; ID Paket/Resi diperlukan.');
            if (!match && !errors.some(e => e.startsWith('Baris ' + row.row + ':'))) errors.push('Baris ' + row.row + ': transaksi dari file pesanan terkirim tidak ditemukan.');
            if (match) mapped.push({ row, transaction: match });
        });
        if (errors.length) throw new Error(errors.slice(0, 12).join('\n') + (errors.length > 12 ? '\nDan ' + (errors.length - 12) + ' masalah lainnya.' : ''));
        const updated = [];
        for (let offset = 0; offset < mapped.length; offset += 300) {
            const batch = writeBatch(db), saved = [];
            mapped.slice(offset, offset + 300).forEach(({ row, transaction }) => {
                const update = {
                    statusDataMarketplace: 'cocok',
                    penghasilanBersihMarketplace: row.netIncome,
                    marketplaceIncomeGross: row.grossIncome,
                    marketplaceFeesTotal: row.marketplaceFeesTotal,
                    marketplaceFeeBreakdown: row.marketplaceFeeBreakdown,
                    sumberDataKeuangan: row.source,
                    statusPencairan: row.payoutStatus,
                    tanggalPencairan: row.paidAt || transaction.tanggalPencairan || null
                };
                batch.update(doc(db, 'transactions', transaction.id), update);
                saved.push({ ...transaction, ...update, id: transaction.id });
            });
            await batch.commit(); updated.push(...saved);
            emit('completed', { transactions: saved, financeUpdate: true });
        }
        importMessage.value = updated.length + ' transaksi berhasil dicocokkan. Penghasilan bersih dan rincian marketplace tersimpan pada tiap transaksi.';
    } catch (error) {
        console.error('Gagal mencocokkan penghasilan marketplace:', error);
        importError.value = error?.message || 'Data penghasilan gagal disimpan.';
    } finally { isSaving.value = false; }
}
function localDateKey(date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return y + '-' + m + '-' + d; }
function pendingDateKey(tx) {
    const value = tx.tanggalTerkirim || tx.tanggal || tx.createdAt;
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? localDateKey(date) : '';
}
function transactionHpp(tx) {
    return Number(tx.totalHpp) || (tx.items || []).reduce((sum, item) => sum + (Number(item.hpp) || 0) * (Number(item.qty) || 0), 0);
}
async function loadPendingTransactions() {
    if (!props.userId) return;
    pendingLoading.value = true;
    try {
        const snap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', props.userId)));
        pendingTransactions.value = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(tx => {
            const status = norm(tx.statusPencairan);
            return !status || status === 'belumcair' || status === 'waiting';
        }).sort((a, b) => (pendingDateKey(a) || '').localeCompare(pendingDateKey(b) || ''));
        if (!selectedPendingTransactions.value.length) {
            const first = pendingTransactions.value.map(pendingDateKey).find(key => key.startsWith(calendarMonth.value));
            if (first) selectedPendingDay.value = first;
        }
    } catch (error) {
        console.error('Gagal memuat pesanan belum terselesaikan:', error);
        manualError.value = error?.message || 'Daftar pesanan tertunda gagal dimuat.';
    } finally { pendingLoading.value = false; }
}
function selectFirstPendingDay() {
    const first = pendingTransactions.value.map(pendingDateKey).find(key => key.startsWith(calendarMonth.value));
    selectedPendingDay.value = first || calendarMonth.value + '-01';
}
function parsePastedIds() {
    return [...new Set(pastedOrderIds.value.split(/[\\r\\n\\t,; ]+/).map(text).filter(Boolean))];
}
async function prepareConfirmedIds() {
    manualError.value = ''; manualMessage.value = ''; manualRows.value = []; isPreparing.value = true;
    try {
        const ids = parsePastedIds();
        if (!ids.length) throw new Error('Tempel minimal satu ID pesanan.');
        const found = [];
        for (let offset = 0; offset < ids.length; offset += 30) {
            const snap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', props.userId), where('marketplaceOrderId', 'in', ids.slice(offset, offset + 30))));
            snap.docs.forEach(item => found.push({ id: item.id, ...item.data() }));
        }
        const channel = marketplaceById(selectedMarketplaceId.value);
        manualRows.value = ids.map(orderId => {
            const txs = found.filter(tx => norm(tx.marketplaceOrderId) === norm(orderId) && (norm(tx.channelId) === norm(channel?.id) || norm(tx.channel) === norm(channel?.name)));
            const alreadySettled = txs.length > 0 && txs.every(tx => ['sudahcair', 'retur/pengembalian', 'retur', 'baranghilang'].includes(norm(tx.statusPencairan)));
            const blocked = txs.some(tx => ['retur/pengembalian', 'retur', 'baranghilang'].includes(norm(tx.statusPencairan)));
            const absentFromReport = shopeeReport.value && !shopeeReport.value.orderIds.some(id => norm(id) === norm(orderId));
            return { id: norm(orderId), orderId, transactions: txs, hpp: txs.reduce((sum, tx) => sum + transactionHpp(tx), 0), alreadySettled, error: !txs.length ? 'ID tidak ditemukan' : blocked ? 'Sudah berstatus retur/hilang' : absentFromReport ? 'ID tidak ada di tab Seller Fee pada file ini' : '' };
        });
    } catch (error) { manualError.value = error.message || 'ID tidak bisa diperiksa.'; }
    finally { isPreparing.value = false; }
}
async function saveConfirmedIds() {
    if (isSavingManual.value || manualRows.value.some(row => row.error)) return;
    isSavingManual.value = true; manualError.value = ''; manualMessage.value = '';
    try {
        const ready = manualRows.value.filter(row => !row.alreadySettled);
        if (!ready.length) { manualMessage.value = 'Semua ID pada daftar ini sudah pernah dikonfirmasi.'; return; }
        const updated = [];
        for (let offset = 0; offset < ready.length; offset += 50) {
            const batch = writeBatch(db), saved = [];
            ready.slice(offset, offset + 50).forEach(row => row.transactions.forEach(tx => {
                const update = {
                    statusPencairan: 'Sudah Cair',
                    statusDataMarketplace: 'id_sukses_terkonfirmasi',
                    sumberDataKeuangan: 'konfirmasi_id_sukses',
                    tanggalPencairan: new Date(payoutPeriodEnd.value + 'T12:00:00'),
                    periodePencairanMulai: payoutPeriodStart.value,
                    periodePencairanSelesai: payoutPeriodEnd.value,
                    konfirmasiSuksesCairManual: true
                };
                batch.update(doc(db, 'transactions', tx.id), update);
                saved.push({ ...tx, ...update, id: tx.id });
            }));
            await batch.commit();
            updated.push(...saved);
        }
        const readyIds = ready.map(row => row.orderId);
        manualRows.value = manualRows.value.map(row => readyIds.includes(row.orderId) ? { ...row, alreadySettled: true } : row);
        manualMessage.value = readyIds.length + ' ID dikonfirmasi berhasil. Data tetap tersimpan di Riwayat Transaksi; nilai penghasilan per pesanan tidak dibuat dari ID saja.';
        await loadPendingTransactions();
        emit('completed', { transactions: updated, financeUpdate: true });
    } catch (error) {
        manualError.value = error?.message || 'Konfirmasi ID gagal disimpan.';
    } finally { isSavingManual.value = false; }
}
async function savePayoutSummary() {
    if (isSavingPayout.value || !selectedMarketplaceId.value || !payoutAmount.value || Number(payoutAmount.value) <= 0 || payoutPeriodStart.value > payoutPeriodEnd.value) return;
    isSavingPayout.value = true; payoutSummaryError.value = ''; payoutSummaryMessage.value = '';
    try {
        const marketplace = marketplaceById(selectedMarketplaceId.value);
        const safeChannel = String(marketplace.id || marketplace.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        const start = payoutPeriodStart.value.replace(/[^0-9]/g, '');
        const end = payoutPeriodEnd.value.replace(/[^0-9]/g, '');
        const id = 'marketplace-income-' + safeChannel + '-' + start + '-' + end;
        const amount = Math.round(Number(payoutAmount.value));
        const record = {
            id, userId: props.userId, jenis: 'pemasukan_lain', kategori: 'Penghasilan Marketplace',
            jumlah: amount, amount, nominal: amount,
            tanggal: new Date(payoutPeriodEnd.value + 'T12:00:00'),
            periodeMulai: payoutPeriodStart.value, periodeSelesai: payoutPeriodEnd.value,
            channel: marketplace.name, channelId: marketplace.id,
            sumber: 'ringkasan_pencairan_manual',
            catatan: 'Total dana dilepas dari ringkasan marketplace; disimpan satu kali per toko dan periode.',
            status: 'aktif', isMarketplaceIncomeReport: true
        };
        await setDoc(doc(db, 'keuangan', id), record, { merge: true });
        payoutSummaryMessage.value = 'Total pencairan ' + formatCurrency(amount) + ' tersimpan untuk ' + marketplace.name + '. Periode sama akan memperbarui catatan ini, bukan menggandakannya.';
        emit('completed', { financeUpdate: true, keuanganRecord: record });
    } catch (error) {
        payoutSummaryError.value = error?.message || 'Total pencairan gagal disimpan.';
    } finally { isSavingPayout.value = false; }
}
async function markReturned(orderId, channelId) {
    if (!window.confirm('Konfirmasi bahwa pesanan ini sedang/terbukti retur? Ini tidak mengembalikan stok. Stok retur harus dicatat di Manajemen Retur setelah barang diterima.')) return;
    try {
        const txs = pendingTransactions.value.filter(tx => norm(tx.marketplaceOrderId) === norm(orderId) && norm(tx.channelId) === norm(channelId));
        const batch = writeBatch(db);
        txs.forEach(tx => batch.update(doc(db, 'transactions', tx.id), { statusPencairan: 'Retur/Pengembalian', statusDataMarketplace: 'retur', returDikonfirmasiManual: true }));
        await batch.commit(); resolutionMessage.value = 'Pesanan ' + orderId + ' ditandai retur. Catat stok setelah barang benar-benar kembali.'; await loadPendingTransactions();
    } catch (error) { resolutionMessage.value = error?.message || 'Status retur gagal disimpan.'; }
}
async function markLost(orderId, channelId) {
    if (!window.confirm('Konfirmasi barang hilang? Fashion OS akan menutup status tertunda dan mencatat HPP sebagai pengeluaran. Pastikan kamu sudah melacak pesanan ini di marketplace.')) return;
    try {
        const txs = pendingTransactions.value.filter(tx => norm(tx.marketplaceOrderId) === norm(orderId) && norm(tx.channelId) === norm(channelId));
        const hpp = txs.reduce((sum, tx) => sum + transactionHpp(tx), 0);
        if (!txs.length || hpp <= 0) throw new Error('Transaksi tidak ditemukan atau HPP belum diisi. Lengkapi HPP sebelum mencatat barang hilang.');
        const batch = writeBatch(db);
        txs.forEach(tx => {
            batch.update(doc(db, 'transactions', tx.id), { statusPencairan: 'Barang Hilang', statusDataMarketplace: 'hilang', barangHilangDikonfirmasiManual: true });
            const expenseId = 'marketplace-loss-' + tx.id;
            batch.set(doc(db, 'keuangan', expenseId), {
                userId: props.userId, jenis: 'pengeluaran', kategori: 'Kerugian Barang Marketplace',
                tipeBiaya: 'operasional', jumlah: transactionHpp(tx), amount: transactionHpp(tx),
                tanggal: new Date(), channel: tx.channel || '', channelId: tx.channelId || '',
                marketplaceOrderId: orderId, transactionId: tx.id,
                sumber: 'marketplace_order_loss', catatan: 'Barang hilang. HPP dicatat sebagai pengeluaran.'
            }, { merge: true });
        });
        await batch.commit(); resolutionMessage.value = 'Pesanan ' + orderId + ' ditandai hilang. Pengeluaran HPP ' + formatCurrency(hpp) + ' sudah dicatat.'; await loadPendingTransactions();
    } catch (error) { resolutionMessage.value = error?.message || 'Pencatatan barang hilang gagal.'; }
}
onMounted(loadPendingTransactions);

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
</script>
