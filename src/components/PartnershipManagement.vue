<template>
    <div class="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div class="mx-auto max-w-7xl space-y-6">
            <header>
                <p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Keuangan dan kemitraan</p>
                <h1 class="mt-1 text-3xl font-bold text-slate-900">Kerja Sama Modal &amp; Bagi Hasil</h1>
                <p class="mt-2 max-w-3xl text-sm text-slate-600">Catat modal teman secara terpisah dari penjualan, dokumentasikan persetujuan usaha, hitung laba dari pencairan yang tersimpan, lalu rekam pembayaran bagi hasil atau pengembalian modal.</p>
            </header>

            <div v-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{{ loadError }}</div>
            <div v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{{ successMessage }}</div>

            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 class="text-lg font-bold text-slate-900">Mitra pemodal</h2>
                        <p class="mt-1 text-sm text-slate-500">Modal awal dan persentase bagi hasil yang disepakati. Data investor lama tetap ditampilkan.</p>
                    </div>
                    <span v-if="loading" class="text-sm text-slate-500">Memuat catatan…</span>
                </div>
                <div v-if="partners.length" class="overflow-x-auto">
                    <table class="w-full min-w-[680px] text-left text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">Nama mitra</th><th class="p-3 text-right">Modal awal</th><th class="p-3 text-right">Tambahan modal</th><th class="p-3 text-right">Modal belum kembali</th><th class="p-3">Bagi hasil</th><th class="p-3 text-right">Sudah dibayar</th></tr></thead>
                        <tbody class="divide-y divide-slate-100">
                            <tr v-for="partner in partners" :key="partner.id">
                                <td class="p-3 font-semibold text-slate-800">{{ partner.name }}<span class="mt-1 block text-xs font-normal text-slate-500">Mulai {{ displayDate(partner.startDate) }}</span></td>
                                <td class="p-3 text-right">{{ currency(partner.amount) }}</td>
                                <td class="p-3 text-right">{{ currency(totalAddedCapital(partner.id)) }}</td>
                                <td class="p-3 text-right font-semibold">{{ currency(outstandingCapital(partner)) }}</td>
                                <td class="p-3"><div class="flex items-center gap-2"><input type="number" min="0" max="100" step="0.1" :value="partner.profitShare" @change="saveProfitShare(partner, $event)" class="w-20 rounded-md border border-slate-300 p-2 text-sm" :disabled="!subscriptionActive"><span>%</span></div></td>
                                <td class="p-3 text-right">{{ currency(totalProfitPaid(partner.id)) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p v-else class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Belum ada mitra pemodal. Tambahkan data kesepakatan pertama di formulir bawah.</p>

                <form @submit.prevent="createPartner" class="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <h3 class="font-semibold text-slate-900">Tambah mitra dan catat modal awal</h3>
                    <p class="mt-1 text-xs text-slate-600">Modal awal dicatat sebagai arus kas modal, bukan penghasilan penjualan.</p>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label class="block"><span class="mb-1 block text-xs font-medium">Nama mitra</span><input v-model.trim="partnerForm.name" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Modal awal (Rp)</span><input v-model.number="partnerForm.amount" type="number" min="1" step="1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Porsi bagi hasil (%)</span><input v-model.number="partnerForm.profitShare" type="number" min="0" max="100" step="0.1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Tanggal modal masuk</span><input v-model="partnerForm.date" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                    </div>
                    <button type="submit" :disabled="saving || !subscriptionActive" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{{ saving ? 'Menyimpan…' : 'Simpan mitra dan modal awal' }}</button>
                </form>
            </section>

            <section class="grid gap-6 xl:grid-cols-2">
                <form @submit.prevent="addCapital" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 class="text-lg font-bold text-slate-900">Catat tambahan modal</h2>
                    <p class="mt-1 text-sm text-slate-500">Setiap setoran modal disimpan sebagai catatan tersendiri dan menambah saldo modal yang masih berputar.</p>
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                        <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium">Mitra</span><select v-model="capitalForm.partnerId" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required><option value="">Pilih mitra</option><option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Jumlah modal (Rp)</span><input v-model.number="capitalForm.amount" type="number" min="1" step="1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Tanggal masuk</span><input v-model="capitalForm.date" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium">Keterangan</span><input v-model.trim="capitalForm.note" class="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Contoh: tambahan modal pembelian stok"></label>
                    </div>
                    <button type="submit" :disabled="saving || !subscriptionActive || !partners.length" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Simpan tambahan modal</button>
                </form>

                <form @submit.prevent="addApproval" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 class="text-lg font-bold text-slate-900">Catat permintaan persetujuan</h2>
                    <p class="mt-1 text-sm text-slate-500">Untuk keputusan produk atau rencana pengeluaran yang dibicarakan dengan mitra. Catatan ini tidak mengirim pesan kepada mitra.</p>
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                        <label class="block"><span class="mb-1 block text-xs font-medium">Mitra</span><select v-model="approvalForm.partnerId" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required><option value="">Pilih mitra</option><option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Jenis</span><select v-model="approvalForm.kind" class="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="pengeluaran">Rencana pengeluaran</option><option value="keputusan">Keputusan usaha / produk</option></select></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Tanggal diajukan</span><input v-model="approvalForm.date" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label v-if="approvalForm.kind === 'pengeluaran'" class="block"><span class="mb-1 block text-xs font-medium">Nominal rencana (Rp)</span><input v-model.number="approvalForm.amount" type="number" min="1" step="1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium">Rencana / alasan</span><input v-model.trim="approvalForm.note" class="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Contoh: persetujuan produksi model baru" required></label>
                    </div>
                    <button type="submit" :disabled="saving || !subscriptionActive || !partners.length" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Simpan permintaan persetujuan</button>
                </form>
            </section>

            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 class="text-lg font-bold text-slate-900">Riwayat persetujuan usaha</h2>
                <p class="mt-1 text-sm text-slate-500">Status persetujuan dicatat manual setelah dibicarakan. Pengeluaran baru masuk ke laporan setelah tombol “Catat sebagai pengeluaran” digunakan.</p>
                <div v-if="approvalRecords.length" class="mt-4 space-y-3">
                    <article v-for="entry in approvalRecords" :key="entry.id" class="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><div class="flex flex-wrap items-center gap-2"><strong class="text-slate-800">{{ entry.note }}</strong><span class="rounded-full px-2 py-1 text-xs font-semibold" :class="approvalClass(entry.status)">{{ approvalLabel(entry.status) }}</span></div><p class="mt-1 text-xs text-slate-500">{{ partnerName(entry.investorId) }} · {{ entry.kind === 'pengeluaran' ? 'Rencana pengeluaran ' + currency(entry.amount) : 'Keputusan usaha / produk' }} · {{ displayDate(entry.requestDate || entry.paymentDate) }}</p><p v-if="entry.actualExpenseId" class="mt-1 text-xs text-emerald-700">Pengeluaran aktual sudah dicatat di Keuangan.</p></div>
                        <div class="flex flex-wrap gap-2" v-if="entry.status === 'menunggu'">
                            <button type="button" @click="setApproval(entry, 'disetujui')" :disabled="saving || !subscriptionActive" class="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">Tandai disetujui</button>
                            <button type="button" @click="setApproval(entry, 'ditolak')" :disabled="saving || !subscriptionActive" class="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Tandai ditolak</button>
                        </div>
                        <button v-else-if="entry.status === 'disetujui' && entry.kind === 'pengeluaran' && !entry.actualExpenseId" type="button" @click="recordApprovedExpense(entry)" :disabled="saving || !subscriptionActive" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Catat sebagai pengeluaran</button>
                    </article>
                </div>
                <p v-else class="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada permintaan persetujuan yang dicatat.</p>
            </section>

            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div>
                    <h2 class="text-lg font-bold text-slate-900">Hitung laba dan bagian mitra</h2>
                    <p class="mt-1 text-sm text-slate-500">Perhitungan memakai total pencairan yang sudah disimpan, HPP pesanan sukses cair, dan biaya operasional pada tanggal pencairan yang dipilih.</p>
                </div>
                <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label class="block"><span class="mb-1 block text-xs font-medium">Mitra</span><select v-model="reportPartnerId" class="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="">Pilih mitra</option><option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></label>
                    <label class="block"><span class="mb-1 block text-xs font-medium">Periode mulai</span><input v-model="periodStart" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm"></label>
                    <label class="block"><span class="mb-1 block text-xs font-medium">Periode selesai</span><input v-model="periodEnd" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm"></label>
                    <div class="flex items-end text-sm text-slate-500">Bagi hasil sesuai kesepakatan: {{ selectedPartner ? selectedPartner.profitShare : 0 }}%</div>
                </div>
                <div v-if="reportPartnerId && periodStart && periodEnd && periodStart <= periodEnd" class="mt-5">
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div class="rounded-xl bg-emerald-50 p-4"><p class="text-xs text-slate-600">Total pencairan tersimpan</p><p class="mt-1 text-lg font-bold text-emerald-800">{{ currency(profitSummary.payout) }}</p></div>
                        <div class="rounded-xl bg-indigo-50 p-4"><p class="text-xs text-slate-600">HPP pesanan sukses cair</p><p class="mt-1 text-lg font-bold text-indigo-800">{{ currency(profitSummary.hpp) }}</p></div>
                        <div class="rounded-xl bg-amber-50 p-4"><p class="text-xs text-slate-600">Biaya operasional tercatat</p><p class="mt-1 text-lg font-bold text-amber-800">{{ currency(profitSummary.expenses) }}</p></div>
                        <div class="rounded-xl p-4" :class="profitSummary.profit >= 0 ? 'bg-blue-50' : 'bg-red-50'"><p class="text-xs text-slate-600">Laba / rugi periode</p><p class="mt-1 text-lg font-bold" :class="profitSummary.profit >= 0 ? 'text-blue-800' : 'text-red-700'">{{ currency(profitSummary.profit) }}</p></div>
                    </div>
                    <div class="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-end lg:justify-between">
                        <div><p class="text-sm font-semibold text-slate-800">Bagian mitra: {{ currency(profitSummary.shareDue) }}</p><p class="mt-1 text-xs text-slate-500">Sudah dibayar: {{ currency(profitSummary.paid) }} · Sisa bagian periode ini: {{ currency(profitSummary.remaining) }}</p><p v-if="!profitSummary.payout" class="mt-1 text-xs text-amber-700">Belum ada ringkasan pencairan pada rentang periode ini. Simpan total pencairan terlebih dahulu.</p></div>
                        <div class="grid gap-3 sm:grid-cols-3">
                            <label class="block"><span class="mb-1 block text-xs font-medium">Nominal dibayarkan (Rp)</span><input v-model.number="profitPaymentForm.amount" type="number" min="1" :max="profitSummary.remaining" step="1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" :placeholder="String(Math.floor(profitSummary.remaining))"></label>
                            <label class="block"><span class="mb-1 block text-xs font-medium">Tanggal pembayaran</span><input v-model="profitPaymentForm.date" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm"></label>
                            <label class="block"><span class="mb-1 block text-xs font-medium">Metode</span><select v-model="profitPaymentForm.method" class="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="transfer">Transfer</option><option value="tunai">Tunai</option></select></label>
                            <button type="button" @click="recordProfitPayment" :disabled="saving || !subscriptionActive || profitSummary.remaining <= 0 || !reportPartnerId" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300 sm:col-span-3">Catat pembayaran bagi hasil</button>
                        </div>
                    </div>
                </div>
                <p v-else class="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Pilih mitra dan rentang tanggal yang valid untuk melihat perhitungan.</p>
                <p class="mt-3 text-xs text-slate-500">Bagian mitra hanya dihitung dari laba positif setelah seluruh pencairan dan biaya periode dicatat. Pastikan periode ini memang sudah selesai direkonsiliasi sebelum membayar.</p>
            </section>

            <section class="grid gap-6 xl:grid-cols-2">
                <form @submit.prevent="recordPrincipalReturn" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 class="text-lg font-bold text-slate-900">Catat pengembalian modal</h2>
                    <p class="mt-1 text-sm text-slate-500">Pengembalian pokok modal terpisah dari pembagian laba dan tidak mengurangi laba usaha.</p>
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                        <label class="block sm:col-span-2"><span class="mb-1 block text-xs font-medium">Mitra</span><select v-model="returnForm.partnerId" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required><option value="">Pilih mitra</option><option v-for="partner in partners" :key="partner.id" :value="partner.id">{{ partner.name }} · modal tersisa {{ currency(outstandingCapital(partner)) }}</option></select></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Nominal dikembalikan (Rp)</span><input v-model.number="returnForm.amount" type="number" min="1" :max="returnPartner ? outstandingCapital(returnPartner) : 0" step="1" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Tanggal</span><input v-model="returnForm.date" type="date" class="w-full rounded-lg border border-slate-300 p-2 text-sm" required></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Metode</span><select v-model="returnForm.method" class="w-full rounded-lg border border-slate-300 p-2 text-sm"><option value="transfer">Transfer</option><option value="tunai">Tunai</option></select></label>
                        <label class="block"><span class="mb-1 block text-xs font-medium">Keterangan</span><input v-model.trim="returnForm.note" class="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Opsional"></label>
                    </div>
                    <button type="submit" :disabled="saving || !subscriptionActive || !returnPartner || outstandingCapital(returnPartner) <= 0" class="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">Simpan pengembalian modal</button>
                </form>

                <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 class="text-lg font-bold text-slate-900">Riwayat modal dan pembayaran</h2>
                    <div v-if="historyRecords.length" class="mt-4 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                        <article v-for="entry in historyRecords" :key="entry.id" class="flex items-start justify-between gap-3 py-3">
                            <div><p class="font-semibold text-slate-800">{{ recordTitle(entry) }}</p><p class="mt-1 text-xs text-slate-500">{{ partnerName(entry.investorId) }} · {{ displayDate(entry.paymentDate || entry.requestDate) }}<span v-if="entry.period"> · {{ entry.period }}</span></p><p v-if="entry.note" class="mt-1 text-xs text-slate-500">{{ entry.note }}</p><p v-if="entry.status && entry.recordType === 'approval_request'" class="mt-1 text-xs" :class="approvalClass(entry.status)">{{ approvalLabel(entry.status) }}</p></div>
                            <strong class="whitespace-nowrap text-sm" :class="entry.recordType === 'capital_contribution' ? 'text-emerald-700' : 'text-slate-800'">{{ entry.recordType === 'approval_request' ? (entry.amount ? currency(entry.amount) : 'Keputusan') : currency(entry.amountPaid || entry.amount || entry.investorShare || 0) }}</strong>
                        </article>
                    </div>
                    <p v-else class="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada catatan baru. Pembayaran investor lama tetap tersimpan di daftar riwayat saat ini.</p>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, ref, watch } from 'vue';
import { addDoc, collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';

const props = defineProps({
    userId: { type: String, default: '' },
    subscriptionActive: { type: Boolean, default: true }
});
const emit = defineEmits(['completed']);
const today = dateKey(new Date());
const thisMonthStart = dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const partners = ref([]);
const records = ref([]);
const financeRecords = ref([]);
const transactions = ref([]);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const successMessage = ref('');
const partnerForm = ref({ name: '', amount: '', profitShare: '', date: today });
const capitalForm = ref({ partnerId: '', amount: '', date: today, note: '' });
const approvalForm = ref({ partnerId: '', kind: 'pengeluaran', amount: '', date: today, note: '' });
const reportPartnerId = ref('');
const periodStart = ref(thisMonthStart);
const periodEnd = ref(today);
const profitPaymentForm = ref({ amount: '', date: today, method: 'transfer' });
const returnForm = ref({ partnerId: '', amount: '', date: today, method: 'transfer', note: '' });

const selectedPartner = computed(() => partners.value.find(item => item.id === reportPartnerId.value) || null);
const returnPartner = computed(() => partners.value.find(item => item.id === returnForm.value.partnerId) || null);
const approvalRecords = computed(() => records.value.filter(item => item.recordType === 'approval_request').sort((a, b) => dateKey(toDate(b.requestDate || b.paymentDate)) .localeCompare(dateKey(toDate(a.requestDate || a.paymentDate)))));
const historyRecords = computed(() => records.value.filter(item => ['capital_contribution', 'profit_share', 'principal_return'].includes(item.recordType) || (!item.recordType && item.investorId)).sort((a, b) => dateKey(toDate(b.paymentDate || b.requestDate)).localeCompare(dateKey(toDate(a.paymentDate || a.requestDate)))));
const profitSummary = computed(() => {
    const selectedId = reportPartnerId.value;
    const start = periodStart.value;
    const end = periodEnd.value;
    const payouts = financeRecords.value.filter(item => item.isMarketplaceIncomeReport === true && summaryEndDate(item) >= start && summaryEndDate(item) <= end);
    const settled = transactions.value.filter(item => isSuccessful(item) && dateInRange(item.tanggalPencairan || item.tanggalTerkirim || item.tanggal, start, end));
    const payout = payouts.reduce((sum, item) => sum + amount(item.jumlah ?? item.amount ?? item.nominal), 0);
    const hpp = settled.reduce((sum, item) => sum + transactionHpp(item), 0);
    const expenses = financeRecords.value.filter(item => isExpense(item) && !isExcludedTransfer(item) && item.tipeBiaya !== 'produksi' && dateInRange(item.tanggal, start, end)).reduce((sum, item) => sum + amount(item.jumlah ?? item.amount), 0);
    const profit = payout - hpp - expenses;
    const partner = partners.value.find(item => item.id === selectedId);
    const shareDue = Math.max(0, profit) * (amount(partner?.profitShare) / 100);
    const label = periodLabel(start, end);
    const paid = records.value.filter(item => item.investorId === selectedId && isProfitShareRecordForPeriod(item, start, end, label)).reduce((sum, item) => sum + amount(item.amountPaid ?? item.investorShare), 0);
    return { payout, hpp, expenses, profit, shareDue, paid, remaining: Math.max(0, shareDue - paid), label };
});

watch(() => props.userId, loadData, { immediate: true });

function dateKey(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function toDate(value) {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}
function dateInRange(value, start, end) {
    const d = toDate(value);
    if (!d || !start || !end) return false;
    const key = dateKey(d);
    return key >= start && key <= end;
}
function summaryEndDate(item) {
    const value = String(item.periodeSelesai || '').slice(0, 10);
    return value || dateKey(toDate(item.tanggal));
}
function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
function transactionHpp(item) {
    const stored = amount(item.totalHpp);
    if (stored > 0) return stored;
    return (item.items || []).reduce((sum, row) => sum + amount(row.hpp) * amount(row.qty || row.jumlah || 0), 0);
}
function isSuccessful(item) {
    const financeStatus = String(item.statusDataMarketplace || '').toLocaleLowerCase('id-ID');
    const payoutStatus = String(item.statusPencairan || '').toLocaleLowerCase('id-ID').replace(/[\s/_-]+/g, '');
    if (['retur', 'returpengembalian', 'baranghilang', 'hilang', 'dibatalkan', 'batal', 'cancelled', 'canceled'].includes(payoutStatus)) return false;
    return item.konfirmasiSuksesCairManual === true ||
        financeStatus === 'id_sukses_terkonfirmasi' ||
        financeStatus === 'cocok' ||
        payoutStatus === 'sudahcair';
}
function isExpense(item) {
    return item.jenis === 'pengeluaran' || item.jenis === 'biaya';
}
function isExcludedTransfer(item) {
    const category = String(item.kategori || '').toLocaleLowerCase('id-ID');
    return item.excludeFromProfitCalculation === true ||
        item.isCapitalPartnershipTransfer === true ||
        category.includes('bagi hasil') ||
        category.includes('pengembalian modal');
}
function isProfitShareRecordForPeriod(item, start, end, label) {
    if (item.recordType === 'profit_share') {
        return item.periodStart === start && item.periodEnd === end;
    }
    return !item.recordType && item.period === label;
}
function periodLabel(start, end) {
    if (!start || !end) return '';
    const a = new Date(start + 'T12:00:00');
    const b = new Date(end + 'T12:00:00');
    const month = a.toLocaleString('id-ID', { month: 'long' });
    return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? month + ' ' + a.getFullYear() : start + ' s/d ' + end;
}
function currency(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount(value));
}
function displayDate(value) {
    const d = toDate(value);
    return d ? d.toLocaleDateString('id-ID') : '—';
}
function approvalLabel(status) {
    return status === 'disetujui' ? 'Disetujui' : status === 'ditolak' ? 'Ditolak' : 'Menunggu persetujuan';
}
function approvalClass(status) {
    return status === 'disetujui' ? 'bg-emerald-100 text-emerald-800' : status === 'ditolak' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
}
function partnerName(id) {
    return partners.value.find(item => item.id === id)?.name || 'Mitra';
}
function totalAddedCapital(id) {
    return records.value.filter(item => item.recordType === 'capital_contribution' && item.investorId === id).reduce((sum, item) => sum + amount(item.amount), 0);
}
function totalReturnedCapital(id) {
    return records.value.filter(item => item.recordType === 'principal_return' && item.investorId === id).reduce((sum, item) => sum + amount(item.amountPaid ?? item.amount), 0);
}
function outstandingCapital(partner) {
    return Math.max(0, amount(partner.amount) + totalAddedCapital(partner.id) - totalReturnedCapital(partner.id));
}
function totalProfitPaid(id) {
    return records.value.filter(item => item.investorId === id && item.recordType === 'profit_share').reduce((sum, item) => sum + amount(item.amountPaid), 0) +
        records.value.filter(item => item.investorId === id && !item.recordType).reduce((sum, item) => sum + amount(item.investorShare), 0);
}
function localDate(value) {
    return new Date(String(value || today) + 'T12:00:00');
}
function appendRecord(record) {
    records.value = [record, ...records.value.filter(item => item.id !== record.id)];
}
function appendFinance(record) {
    financeRecords.value = [record, ...financeRecords.value.filter(item => item.id !== record.id)];
    emit('completed', { keuanganRecord: record });
}
async function loadData() {
    if (!props.userId) return;
    loading.value = true;
    loadError.value = '';
    try {
        const [partnerSnap, recordSnap, financeSnap, transactionSnap] = await Promise.all([
            getDocs(query(collection(db, 'investors'), where('userId', '==', props.userId))),
            getDocs(query(collection(db, 'investor_payments'), where('userId', '==', props.userId))),
            getDocs(query(collection(db, 'keuangan'), where('userId', '==', props.userId))),
            getDocs(query(collection(db, 'transactions'), where('userId', '==', props.userId)))
        ]);
        partners.value = partnerSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
        records.value = recordSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        financeRecords.value = financeSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        transactions.value = transactionSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        if (!reportPartnerId.value && partners.value.length) reportPartnerId.value = partners.value[0].id;
        if (!capitalForm.value.partnerId && partners.value.length) capitalForm.value.partnerId = partners.value[0].id;
        if (!approvalForm.value.partnerId && partners.value.length) approvalForm.value.partnerId = partners.value[0].id;
        if (!returnForm.value.partnerId && partners.value.length) returnForm.value.partnerId = partners.value[0].id;
    } catch (error) {
        console.error('Gagal memuat kerja sama modal:', error);
        loadError.value = error?.message || 'Catatan kerja sama gagal dimuat.';
    } finally {
        loading.value = false;
    }
}
async function createPartner() {
    const name = partnerForm.value.name.trim();
    const initialAmount = amount(partnerForm.value.amount);
    const profitShare = amount(partnerForm.value.profitShare);
    if (!props.userId || !name || initialAmount <= 0 || profitShare < 0 || profitShare > 100) return;
    saving.value = true; successMessage.value = ''; loadError.value = '';
    try {
        const partnerRef = doc(collection(db, 'investors'));
        const capitalRef = doc(collection(db, 'investor_payments'));
        const financeRef = doc(collection(db, 'keuangan'));
        const date = localDate(partnerForm.value.date);
        const partner = { userId: props.userId, name, amount: initialAmount, profitShare, startDate: date, status: 'aktif', arrangementType: 'kerja_sama_modal_bagi_hasil' };
        const record = { userId: props.userId, investorId: partnerRef.id, investorName: name, recordType: 'capital_contribution', amount: initialAmount, amountPaid: initialAmount, paymentDate: date, paymentMethod: 'modal_awal', note: 'Modal awal kerja sama', totalPayment: 0 };
        const finance = { userId: props.userId, jenis: 'pemasukan', kategori: 'Modal Kerja Sama', jumlah: initialAmount, amount: initialAmount, tanggal: date, catatan: 'Modal awal dari ' + name, sumber: 'kerja_sama_modal', investorId: partnerRef.id, isCapitalPartnershipTransfer: true, excludeFromProfitCalculation: true };
        const batch = writeBatch(db);
        batch.set(partnerRef, partner); batch.set(capitalRef, record); batch.set(financeRef, finance);
        await batch.commit();
        partners.value = [...partners.value, { id: partnerRef.id, ...partner }];
        appendRecord({ id: capitalRef.id, ...record });
        appendFinance({ id: financeRef.id, ...finance });
        partnerForm.value = { name: '', amount: '', profitShare: '', date: today };
        successMessage.value = 'Mitra dan modal awal berhasil dicatat.';
    } catch (error) {
        console.error('Gagal mencatat mitra:', error);
        loadError.value = error?.message || 'Mitra gagal disimpan.';
    } finally { saving.value = false; }
}
async function saveProfitShare(partner, event) {
    const nextValue = Number(event?.target?.value);
    if (!Number.isFinite(nextValue) || nextValue < 0 || nextValue > 100 || nextValue === Number(partner.profitShare)) return;
    saving.value = true; loadError.value = '';
    try {
        await updateDoc(doc(db, 'investors', partner.id), { profitShare: nextValue, arrangementType: 'kerja_sama_modal_bagi_hasil' });
        partners.value = partners.value.map(item => item.id === partner.id ? { ...item, profitShare: nextValue } : item);
        successMessage.value = 'Persentase bagi hasil diperbarui.';
    } catch (error) { loadError.value = error?.message || 'Persentase gagal diperbarui.'; }
    finally { saving.value = false; }
}
async function addCapital() {
    const partner = partners.value.find(item => item.id === capitalForm.value.partnerId);
    const value = amount(capitalForm.value.amount);
    if (!partner || value <= 0 || !props.userId) return;
    saving.value = true; successMessage.value = ''; loadError.value = '';
    try {
        const recordRef = doc(collection(db, 'investor_payments'));
        const financeRef = doc(collection(db, 'keuangan'));
        const date = localDate(capitalForm.value.date);
        const note = capitalForm.value.note.trim() || 'Tambahan modal kerja sama';
        const record = { userId: props.userId, investorId: partner.id, investorName: partner.name, recordType: 'capital_contribution', amount: value, amountPaid: value, paymentDate: date, paymentMethod: 'setoran_modal', note, totalPayment: 0 };
        const finance = { userId: props.userId, jenis: 'pemasukan', kategori: 'Modal Kerja Sama', jumlah: value, amount: value, tanggal: date, catatan: note + ' · ' + partner.name, sumber: 'kerja_sama_modal', investorId: partner.id, isCapitalPartnershipTransfer: true, excludeFromProfitCalculation: true };
        const batch = writeBatch(db); batch.set(recordRef, record); batch.set(financeRef, finance); await batch.commit();
        appendRecord({ id: recordRef.id, ...record }); appendFinance({ id: financeRef.id, ...finance });
        capitalForm.value = { ...capitalForm.value, amount: '', note: '' }; successMessage.value = 'Tambahan modal berhasil dicatat.';
    } catch (error) { loadError.value = error?.message || 'Tambahan modal gagal disimpan.'; }
    finally { saving.value = false; }
}
async function addApproval() {
    const partner = partners.value.find(item => item.id === approvalForm.value.partnerId);
    const note = approvalForm.value.note.trim();
    const value = approvalForm.value.kind === 'pengeluaran' ? amount(approvalForm.value.amount) : 0;
    if (!partner || !note || (approvalForm.value.kind === 'pengeluaran' && value <= 0)) return;
    saving.value = true; loadError.value = '';
    try {
        const record = { userId: props.userId, investorId: partner.id, investorName: partner.name, recordType: 'approval_request', kind: approvalForm.value.kind, amount: value, note, requestDate: localDate(approvalForm.value.date), status: 'menunggu', totalPayment: 0 };
        await addDoc(collection(db, 'investor_payments'), record).then(ref => { record.id = ref.id; });
        appendRecord(record);
        approvalForm.value = { ...approvalForm.value, amount: '', note: '', kind: approvalForm.value.kind };
        successMessage.value = 'Permintaan persetujuan tercatat.';
    } catch (error) { loadError.value = error?.message || 'Permintaan persetujuan gagal disimpan.'; }
    finally { saving.value = false; }
}
async function setApproval(entry, status) {
    saving.value = true; loadError.value = '';
    try {
        const decisionDate = new Date();
        await updateDoc(doc(db, 'investor_payments', entry.id), { status, decisionDate });
        appendRecord({ ...entry, status, decisionDate });
        successMessage.value = status === 'disetujui' ? 'Permintaan ditandai disetujui.' : 'Permintaan ditandai ditolak.';
    } catch (error) { loadError.value = error?.message || 'Status persetujuan gagal disimpan.'; }
    finally { saving.value = false; }
}
async function recordApprovedExpense(entry) {
    if (entry.status !== 'disetujui' || entry.actualExpenseId || amount(entry.amount) <= 0) return;
    saving.value = true; loadError.value = '';
    try {
        const financeRef = doc(collection(db, 'keuangan'));
        const finance = { userId: props.userId, jenis: 'pengeluaran', kategori: 'Biaya Operasional', tipeBiaya: 'operasional', jumlah: amount(entry.amount), amount: amount(entry.amount), tanggal: new Date(), catatan: entry.note + ' · Persetujuan ' + entry.id, sumber: 'persetujuan_kerja_sama', investorId: entry.investorId, approvalRecordId: entry.id };
        const batch = writeBatch(db);
        batch.set(financeRef, finance);
        batch.update(doc(db, 'investor_payments', entry.id), { actualExpenseId: financeRef.id, actualExpenseDate: finance.tanggal });
        await batch.commit();
        appendRecord({ ...entry, actualExpenseId: financeRef.id, actualExpenseDate: finance.tanggal });
        appendFinance({ id: financeRef.id, ...finance });
        successMessage.value = 'Pengeluaran yang disetujui sudah dicatat di Keuangan.';
    } catch (error) { loadError.value = error?.message || 'Pengeluaran gagal dicatat.'; }
    finally { saving.value = false; }
}
async function recordProfitPayment() {
    const partner = selectedPartner.value;
    const value = amount(profitPaymentForm.value.amount || profitSummary.value.remaining);
    if (!partner || value <= 0 || value > profitSummary.value.remaining || !props.userId) return;
    saving.value = true; loadError.value = ''; successMessage.value = '';
    try {
        const paymentRef = doc(collection(db, 'investor_payments'));
        const financeRef = doc(collection(db, 'keuangan'));
        const date = localDate(profitPaymentForm.value.date);
        const payment = { userId: props.userId, investorId: partner.id, investorName: partner.name, recordType: 'profit_share', period: profitSummary.value.label, periodStart: periodStart.value, periodEnd: periodEnd.value, payoutTotal: profitSummary.value.payout, hppTotal: profitSummary.value.hpp, operatingExpenses: profitSummary.value.expenses, profitBasis: profitSummary.value.profit, profitSharePercentage: amount(partner.profitShare), shareDue: profitSummary.value.shareDue, amountPaid: value, investorShare: value, totalPayment: value, paymentDate: date, paymentMethod: profitPaymentForm.value.method, note: 'Pembayaran bagian laba periode ' + profitSummary.value.label };
        const finance = { userId: props.userId, jenis: 'pengeluaran', kategori: 'Pembayaran Bagi Hasil', jumlah: value, amount: value, tanggal: date, catatan: 'Bagi hasil ' + partner.name + ' · ' + profitSummary.value.label, sumber: 'kerja_sama_modal_bagi_hasil', investorId: partner.id, isCapitalPartnershipTransfer: true, excludeFromProfitCalculation: true, isProfitDistribution: true, periodeLabaTahun: Number(periodEnd.value.slice(0, 4)), periodeLabaBulan: Number(periodEnd.value.slice(5, 7)), periodeMulai: periodStart.value, periodeSelesai: periodEnd.value };
        const batch = writeBatch(db); batch.set(paymentRef, payment); batch.set(financeRef, finance); await batch.commit();
        appendRecord({ id: paymentRef.id, ...payment }); appendFinance({ id: financeRef.id, ...finance });
        profitPaymentForm.value = { amount: '', date: today, method: 'transfer' };
        successMessage.value = 'Pembayaran bagi hasil berhasil dicatat dan ditautkan ke dasar perhitungannya.';
    } catch (error) { loadError.value = error?.message || 'Pembayaran bagi hasil gagal dicatat.'; }
    finally { saving.value = false; }
}
async function recordPrincipalReturn() {
    const partner = returnPartner.value;
    const value = amount(returnForm.value.amount);
    if (!partner || value <= 0 || value > outstandingCapital(partner) || !props.userId) return;
    saving.value = true; loadError.value = ''; successMessage.value = '';
    try {
        const paymentRef = doc(collection(db, 'investor_payments'));
        const financeRef = doc(collection(db, 'keuangan'));
        const date = localDate(returnForm.value.date);
        const note = returnForm.value.note.trim() || 'Pengembalian pokok modal';
        const payment = { userId: props.userId, investorId: partner.id, investorName: partner.name, recordType: 'principal_return', amount: value, amountPaid: value, totalPayment: value, paymentDate: date, paymentMethod: returnForm.value.method, note };
        const finance = { userId: props.userId, jenis: 'pengeluaran', kategori: 'Pengembalian Modal Kerja Sama', jumlah: value, amount: value, tanggal: date, catatan: note + ' · ' + partner.name, sumber: 'pengembalian_modal_kerja_sama', investorId: partner.id, isCapitalPartnershipTransfer: true, excludeFromProfitCalculation: true };
        const batch = writeBatch(db); batch.set(paymentRef, payment); batch.set(financeRef, finance); await batch.commit();
        appendRecord({ id: paymentRef.id, ...payment }); appendFinance({ id: financeRef.id, ...finance });
        returnForm.value = { ...returnForm.value, amount: '', note: '' };
        successMessage.value = 'Pengembalian modal tercatat terpisah dari laba.';
    } catch (error) { loadError.value = error?.message || 'Pengembalian modal gagal dicatat.'; }
    finally { saving.value = false; }
}
function recordTitle(entry) {
    if (entry.recordType === 'capital_contribution') return entry.note === 'Modal awal kerja sama' ? 'Modal awal masuk' : 'Tambahan modal masuk';
    if (entry.recordType === 'profit_share') return 'Pembayaran bagi hasil';
    if (entry.recordType === 'principal_return') return 'Pengembalian modal';
    if (entry.investorShare || entry.totalPayment) return 'Pembayaran bagi hasil lama';
    return 'Catatan';
}
</script>
