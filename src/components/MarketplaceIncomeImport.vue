<template>
    <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
            <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">Tahap keuangan</p>
            <h2 class="mt-1 text-xl font-bold text-slate-900">Cocokkan Penghasilan Marketplace</h2>
            <p class="mt-2 max-w-3xl text-sm text-slate-600">
                Setelah pesanan terkirim masuk Fashion OS, unggah tab SIAP_PENGHASILAN dari Google Sheets.
                Penghasilan bersih disimpan ke transaksi yang cocok; data tidak dijumlahkan ulang saat file diimpor kembali.
            </p>
        </div>

        <div class="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            Kolom wajib: <strong>Channel, ID Pesanan, Penghasilan Bersih</strong>.
            Gunakan ID Paket atau No Resi jika satu pesanan memiliki beberapa paket.
            Status pencairan dan tanggal cair boleh disertakan.
        </div>

        <div class="mt-4 flex justify-end"><button type="button" @click="downloadTemplate" class="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Unduh Template Penghasilan</button></div>
        <div class="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
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
                    <p class="mt-1 text-xs text-slate-500">Setiap baris harus cocok ke satu transaksi Fashion OS.</p>
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
                        <tr><th class="p-3">Channel</th><th class="p-3">ID Pesanan</th><th class="p-3">ID Paket / Resi</th><th class="p-3">Penghasilan Bersih</th><th class="p-3">Pencairan</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="row in rows.slice(0, 100)" :key="row.key">
                            <td class="p-3">{{ row.channelName }}</td>
                            <td class="p-3 font-medium">{{ row.orderId }}</td>
                            <td class="p-3">{{ row.packageId || row.trackingNumber || '—' }}</td>
                            <td class="p-3 font-semibold text-emerald-700">{{ formatCurrency(row.netIncome) }}</td>
                            <td class="p-3">{{ row.payoutStatus }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <p v-if="importError" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ importError }}</p>
            <p v-if="importMessage" class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ importMessage }}</p>

            <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p class="max-w-2xl text-xs text-slate-500">Impor ulang akan memperbarui nilai pada transaksi yang sama, bukan membuat transaksi baru.</p>
                <button type="button" @click="saveIncome" :disabled="!canSave" class="rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                    {{ isSaving ? 'Menyimpan…' : 'Simpan Penghasilan' }}
                </button>
            </div>
        </div>
    </section>
</template>

<script setup>
/* global defineProps, defineEmits */
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
const rows = ref([]);
const rowErrors = ref([]);
const isSaving = ref(false);

const canSave = computed(() => !isSaving.value && props.userId && props.subscriptionActive && rows.value.length > 0 && rowErrors.value.length === 0);
const text = value => String(value ?? '').trim();
const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
    channel: ['channel', 'marketplace', 'platform', 'nama marketplace', 'nama channel'],
    orderId: ['id pesanan', 'id pesanan marketplace', 'order id', 'orderid', 'order sn', 'ordersn', 'nomor pesanan', 'no pesanan'],
    packageId: ['id paket', 'package id', 'packageid', 'package sn', 'packagesn', 'shipment id', 'id pengiriman', 'nomor paket'],
    tracking: ['no resi', 'nomor resi', 'resi', 'tracking number', 'tracking no', 'awb', 'airway bill'],
    netIncome: ['penghasilan bersih', 'net income', 'net payout', 'dana diterima', 'jumlah pencairan', 'seller income', 'income after deduction'],
    payoutStatus: ['status pencairan', 'payout status', 'status dana'],
    paidAt: ['tanggal pencairan', 'tanggal cair', 'payout date', 'paid at', 'tanggal dana diterima']
};
const findColumn = (headers, field) => {
    const choices = new Set(aliases[field].map(norm));
    return headers.find(header => choices.has(norm(header)));
};
const channelFor = value => {
    const key = norm(value);
    const exact = props.marketplaces.find(channel => norm(channel.id) === key || norm(channel.name) === key);
    if (exact) return exact;
    if (key.startsWith('tiktok')) return props.marketplaces.find(channel => norm(channel.name).startsWith('tiktok'));
    if (key.startsWith('shopee')) return props.marketplaces.find(channel => norm(channel.name).startsWith('shopee'));
    return null;
};

function parseAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = text(value).replace(/\s/g, '').replace(/Rp/ig, '');
    if (!raw) return NaN;
    const negative = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return NaN;
    const amount = Number(digits);
    return negative ? -amount : amount;
}

function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number' && value > 0) {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) return new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S);
    }
    const raw = text(value);
    if (!raw) return null;
    const idDate = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (idDate) return new Date(Number(idDate[3]), Number(idDate[2]) - 1, Number(idDate[1]), Number(idDate[4] || 0), Number(idDate[5] || 0), Number(idDate[6] || 0));
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0));
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function downloadTemplate() {
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Channel', 'ID Pesanan', 'ID Paket', 'No Resi', 'Penghasilan Bersih', 'Status Pencairan', 'Tanggal Pencairan']
    ]);
    sheet['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 20 }, { wch: 20 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'SIAP_PENGHASILAN');
    XLSX.writeFile(book, 'Template_Penghasilan_Marketplace.xlsx');
}

function handleFile(event) {
    const file = event.target.files?.[0];
    fileError.value = '';
    importError.value = '';
    importMessage.value = '';
    rows.value = [];
    rowErrors.value = [];
    workbook.value = null;
    if (!file) return;
    fileName.value = file.name;
    file.arrayBuffer().then(buffer => {
        const parsed = XLSX.read(buffer, { type: 'array', cellDates: true });
        if (!parsed.SheetNames?.length) throw new Error('File tidak berisi tab yang bisa dibaca.');
        workbook.value = parsed;
        sheetNames.value = parsed.SheetNames;
        selectedSheet.value = parsed.SheetNames.find(name => norm(name) === 'siappenghasilan') || parsed.SheetNames[0];
        parseSelectedSheet();
    }).catch(error => {
        fileError.value = error.message || 'File gagal dibaca.';
    });
}

function parseSelectedSheet() {
    fileError.value = '';
    rows.value = [];
    rowErrors.value = [];
    importError.value = '';
    importMessage.value = '';
    const sheet = workbook.value?.Sheets?.[selectedSheet.value];
    if (!sheet) return;
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    if (!records.length) {
        fileError.value = 'Tab kosong atau baris pertama tidak berisi nama kolom.';
        return;
    }
    const headers = Object.keys(records[0]);
    const columns = Object.fromEntries(Object.keys(aliases).map(field => [field, findColumn(headers, field)]));
    const missing = ['channel', 'orderId', 'netIncome'].filter(field => !columns[field]);
    if (missing.length) {
        fileError.value = 'Kolom wajib belum ditemukan: ' + missing.map(field => ({ channel: 'Channel', orderId: 'ID Pesanan', netIncome: 'Penghasilan Bersih' }[field])).join(', ');
        return;
    }

    const seenIdentifiers = new Set();
    records.forEach((record, index) => {
        const rowNumber = index + 2;
        const channelText = text(record[columns.channel]);
        const orderId = text(record[columns.orderId]);
        const packageId = text(columns.packageId ? record[columns.packageId] : '');
        const trackingNumber = text(columns.tracking ? record[columns.tracking] : '');
        const netIncome = parseAmount(record[columns.netIncome]);
        const statusRaw = text(columns.payoutStatus ? record[columns.payoutStatus] : '');
        const paidAt = parseDate(columns.paidAt ? record[columns.paidAt] : '');
        const channel = channelFor(channelText);
        const problems = [];
        if (!channel) problems.push('Channel tidak ditemukan di pengaturan Marketplace');
        if (!orderId) problems.push('ID Pesanan kosong');
        if (!Number.isFinite(netIncome)) problems.push('Penghasilan Bersih kosong atau bukan angka');
        if (statusRaw && !['sudahcair', 'cair', 'paid', 'settled', 'belumcair', 'belumdicairkan', 'waiting', 'menunggupencairan', 'diproses'].includes(norm(statusRaw))) problems.push('Status pencairan tidak dikenali');
        if (columns.paidAt && text(record[columns.paidAt]) && !paidAt) problems.push('Tanggal pencairan tidak dikenali');
        const identifier = [channel?.id || channelText, orderId, packageId || trackingNumber].map(norm).join('|');
        if (seenIdentifiers.has(identifier)) problems.push('Data penghasilan untuk ID ini muncul lebih dari sekali');
        seenIdentifiers.add(identifier);
        if (problems.length) {
            rowErrors.value.push({ key: 'row-' + rowNumber, row: rowNumber, message: problems.join('; ') });
            return;
        }
        const rawStatus = norm(statusRaw);
        const payoutStatus = ['sudahcair', 'cair', 'paid', 'settled'].includes(rawStatus) || (!rawStatus && paidAt)
            ? 'Sudah Cair'
            : ['waiting', 'menunggupencairan', 'diproses'].includes(rawStatus)
                ? 'Waiting'
                : 'Belum Cair';
        rows.value.push({
            key: identifier,
            row: rowNumber,
            channelId: channel.id,
            channelName: channel.name,
            orderId,
            packageId,
            trackingNumber,
            netIncome,
            payoutStatus,
            paidAt
        });
    });
}

async function saveIncome() {
    if (!canSave.value) return;
    isSaving.value = true;
    importError.value = '';
    importMessage.value = '';
    try {
        const orderIds = Array.from(new Set(rows.value.map(row => row.orderId)));
        const existing = [];
        for (let offset = 0; offset < orderIds.length; offset += 30) {
            const ids = orderIds.slice(offset, offset + 30);
            const snapshot = await getDocs(query(
                collection(db, 'transactions'),
                where('userId', '==', props.userId),
                where('marketplaceOrderId', 'in', ids)
            ));
            snapshot.docs.forEach(item => existing.push({ id: item.id, ...item.data() }));
        }

        const mapped = [];
        const errors = [];
        rows.value.forEach(row => {
            const matches = existing.filter(transaction =>
                norm(transaction.marketplaceOrderId) === norm(row.orderId) &&
                (norm(transaction.channelId) === norm(row.channelId) || norm(transaction.channel) === norm(row.channelName))
            );
            let matchingTransaction = null;
            const packageKey = norm(row.packageId || row.trackingNumber);
            if (packageKey) {
                const packageMatches = matches.filter(transaction =>
                    norm(transaction.externalPackageId) === packageKey || norm(transaction.trackingNumber) === packageKey
                );
                if (packageMatches.length === 1) matchingTransaction = packageMatches[0];
                else if (packageMatches.length > 1) errors.push(`Baris ${row.row}: ID paket cocok ke lebih dari satu transaksi.`);
            } else if (matches.length === 1) {
                matchingTransaction = matches[0];
            } else if (matches.length > 1) {
                errors.push(`Baris ${row.row}: pesanan memiliki beberapa paket; tambahkan ID Paket atau No Resi.`);
            }
            if (!matchingTransaction && !errors.some(message => message.startsWith(`Baris ${row.row}:`))) {
                errors.push(`Baris ${row.row}: transaksi terkirim tidak ditemukan di Fashion OS.`);
            } else if (matchingTransaction) {
                mapped.push({ row, transaction: matchingTransaction });
            }
        });
        if (errors.length) throw new Error(errors.slice(0, 12).join('\n') + (errors.length > 12 ? `\nDan ${errors.length - 12} masalah lainnya.` : ''));

        let updated = [];
        for (let offset = 0; offset < mapped.length; offset += 300) {
            const chunk = mapped.slice(offset, offset + 300);
            const batch = writeBatch(db);
            const saved = [];
            chunk.forEach(({ row, transaction }) => {
                const update = {
                    statusDataMarketplace: 'cocok',
                    penghasilanBersihMarketplace: row.netIncome,
                    statusPencairan: row.payoutStatus,
                    sumberDataKeuangan: 'google_sheets_import',
                    tanggalPencairan: row.paidAt || transaction.tanggalPencairan || null
                };
                batch.update(doc(db, 'transactions', transaction.id), update);
                saved.push({ ...transaction, ...update, id: transaction.id });
            });
            await batch.commit();
            updated = updated.concat(saved);
            emit('completed', { transactions: saved, financeUpdate: true });
        }
        importMessage.value = `${updated.length} transaksi berhasil dicocokkan dengan penghasilan marketplace. Impor ulang hanya memperbarui nilai transaksi yang sama.`;
    } catch (error) {
        console.error('Gagal mencocokkan penghasilan marketplace:', error);
        importError.value = error?.message || 'Data penghasilan gagal disimpan.';
    } finally {
        isSaving.value = false;
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
</script>
