<template>
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
            <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">Tahap keuangan</p>
            <h2 class="mt-1 text-xl font-bold text-slate-900">Cocokkan Penghasilan Marketplace</h2>
            <p class="mt-2 max-w-3xl text-sm text-slate-600">
                Unggah langsung laporan penghasilan Shopee atau TikTok. Fashion OS mencocokkan ID pesanan dengan transaksi yang sebelumnya dibuat dari file pesanan terkirim.
            </p>
        </div>

        <div class="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            Pilih marketplace lalu unggah file asli laporan penghasilan. Nilai penghasilan bersih dan rincian biaya marketplace dibaca dari file; ID paket/resi dipakai bila satu pesanan memiliki beberapa transaksi.
        </div>

        
        <div class="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
            <label class="block">
                <span class="mb-1 block text-sm font-medium text-slate-700">Marketplace</span>
                <select v-model="selectedMarketplaceId" @change="parseSelectedSheet" class="w-full rounded-lg border border-slate-300 p-2 text-sm">
                    <option value="">Pilih marketplace</option>
                    <option v-for="marketplace in marketplaces" :key="marketplace.id" :value="marketplace.id">{{ marketplace.name }}</option>
                </select>
            </label>
            <label class="block">
                <span class="mb-1 block text-sm font-medium text-slate-700">File data penghasilan</span>
                <input type="file" accept=".xlsx,.xls,.csv" @change="handleFile" class="block w-full rounded-lg border border-slate-300 p-2 text-sm">
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

        <div v-if="rows.length || rowErrors.length" class="mt-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 class="font-bold text-slate-900">Periksa sebelum menyimpan</h3>
                    <p class="mt-1 text-xs text-slate-500">Setiap ID pesanan harus cocok dengan transaksi yang diimpor dari file pesanan terkirim.</p>
                </div>
                <div class="flex gap-2 text-xs font-semibold">
                    <span class="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{{ rows.length }} baris siap</span>
                    <span class="rounded-full bg-red-100 px-3 py-1 text-red-800">{{ rowErrors.length }} bermasalah</span>
                </div>
            </div>

            <div v-if="rowErrors.length" class="mt-4 max-h-48 overflow-auto rounded-xl border border-red-200 bg-red-50 p-3">
                <ul class="list-inside list-disc space-y-1 text-xs text-red-700">
                    <li v-for="issue in rowErrors.slice(0, 100)" :key="issue.key">Baris {{ issue.row }}: {{ issue.message }}</li>
                </ul>
                <p v-if="rowErrors.length > 100" class="mt-2 text-xs text-red-700">Dan {{ rowErrors.length - 100 }} masalah lainnya.</p>
            </div>

            <div v-if="rows.length" class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full min-w-[700px] text-left text-sm">
                    <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr><th class="p-3">Channel</th><th class="p-3">ID Pesanan</th><th class="p-3">Penjualan Kotor</th><th class="p-3">Potongan</th><th class="p-3">Penghasilan Bersih</th><th class="p-3">Pencairan</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="row in rows.slice(0, 100)" :key="row.key">
                            <td class="p-3">{{ row.channelName }}</td>
                            <td class="p-3 font-medium">{{ row.orderId }}</td>
                            <td class="p-3">{{ formatCurrency(row.grossIncome) }}</td>
                            <td class="p-3">{{ formatCurrency(row.marketplaceFeesTotal) }}</td>
                            <td class="p-3 font-semibold text-emerald-700">{{ formatCurrency(row.netIncome) }}</td>
                            <td class="p-3">{{ row.payoutStatus }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p v-if="importError" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ importError }}</p>
            <p v-if="importMessage" class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ importMessage }}</p>

            <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p class="max-w-2xl text-xs text-slate-500">Impor ulang memperbarui data keuangan transaksi yang sama dan tidak membuat transaksi baru.</p>
                <button type="button" @click="saveIncome" :disabled="!canSave" class="rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                    {{ isSaving ? 'Menyimpan…' : 'Simpan Penghasilan' }}
                </button>
            </div>
        </div>
    </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import * as XLSX from 'xlsx';
import { db } from '../firebase.js';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';

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
const rows = ref([]);
const rowErrors = ref([]);
const isSaving = ref(false);
const canSave = computed(() => !isSaving.value && !!props.userId && props.subscriptionActive && rows.value.length > 0 && rowErrors.value.length === 0);
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
    fileError.value = ''; rows.value = []; rowErrors.value = []; importError.value = ''; importMessage.value = '';
    const sheet = workbook.value?.Sheets?.[selectedSheet.value];
    if (!sheet) return;
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
function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
</script>
