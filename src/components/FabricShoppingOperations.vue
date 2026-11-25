<template>
<section class="space-y-5" aria-label="Operasional belanja kain">
    <div class="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
        <div><h3 class="text-lg font-bold text-slate-900">Operasional belanja kain</h3><p class="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Anggaran awal Rp100 per yard dari panjang yang dibeli. Catat pembayaran per nota atau sekaligus; pengeluaran otomatis masuk ke Keuangan dengan tipe Produksi.</p></div>
        <button type="button" @click="refresh" :disabled="loading || saving" class="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">{{ loading ? 'Memuat…' : 'Perbarui data' }}</button>
    </div>
    <p v-if="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
    <p v-if="message" role="status" class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ message }}</p>
    <p v-if="loading" role="status" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Memuat status pembayaran…</p>
    <template v-if="loaded">
    <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm font-semibold text-slate-700">Periode pembelian<select v-model="period" :disabled="saving || Boolean(form)" class="mt-1 block rounded-lg border border-slate-300 bg-white p-2.5"><option value="all">Semua waktu</option><option value="today">Hari ini</option><option value="last7">7 hari terakhir</option><option value="last30">30 hari terakhir</option><option value="month">Bulan ini</option><option value="year">Tahun ini</option><option value="custom">Rentang tanggal</option></select></label>
        <template v-if="period === 'custom'"><label class="text-sm font-semibold text-slate-700">Dari<input v-model="start" type="date" :disabled="saving || Boolean(form)" class="mt-1 block rounded-lg border border-slate-300 p-2.5"></label><label class="text-sm font-semibold text-slate-700">Sampai<input v-model="end" type="date" :disabled="saving || Boolean(form)" class="mt-1 block rounded-lg border border-slate-300 p-2.5"></label></template>
        <label class="min-w-48 flex-1 text-sm font-semibold text-slate-700">Cari nota, kain, atau toko<input v-model="search" :disabled="saving || Boolean(form)" placeholder="Contoh: Sabrina atau kode nota" class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"></label>
    </div>
    <p v-if="start && end && period === 'custom' && start > end" class="text-sm text-red-600">Tanggal awal tidak boleh melewati tanggal akhir.</p>
    <div class="grid gap-3 md:grid-cols-3">
        <article class="rounded-xl border border-amber-200 bg-amber-50/40 p-4"><p class="text-xs font-bold uppercase text-amber-800">Belum dibayar</p><p class="mt-2 text-2xl font-bold text-amber-950">{{ money(summary.unpaid.amount) }}</p><p class="mt-1 text-sm text-amber-900">{{ number(summary.unpaid.yard) }} yard · {{ summary.unpaid.count }} nota</p></article>
        <article class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"><p class="text-xs font-bold uppercase text-emerald-700">Sudah dibayar</p><p class="mt-2 text-2xl font-bold text-emerald-950">{{ money(summary.paid.amount) }}</p><p class="mt-1 text-sm text-emerald-900">{{ number(summary.paid.yard) }} yard · {{ summary.paid.count }} nota</p></article>
        <article class="rounded-xl border border-slate-200 bg-slate-50 p-4"><p class="text-xs font-bold uppercase text-slate-600">Status data lama belum ditetapkan</p><p class="mt-2 text-2xl font-bold text-slate-900">{{ money(summary.review.amount) }}</p><p class="mt-1 text-sm text-slate-600">Estimasi {{ number(summary.review.yard) }} yard · {{ summary.review.count }} nota</p></article>
    </div>
    <p class="text-xs text-slate-500">Ringkasan mengikuti periode dan pencarian, mencakup semua status. Biaya yang sudah dibayar disimpan sesuai panjang dan tarif saat pembayaran dicatat.</p>
    <p v-if="summary.review.count" class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Pembelian lama belum memiliki status operasional. Jika pernah dibayar, pilih <strong>Sudah dibayar sebelumnya</strong> agar tidak membuat pengeluaran kedua. Jika belum dibayar, pilih <strong>Tetapkan belum dibayar</strong> atau langsung catat pembayarannya.</p>
    <div class="flex flex-wrap items-center justify-between gap-3">
        <label class="text-sm font-semibold text-slate-700">Status<select v-model="statusFilter" :disabled="saving || Boolean(form)" class="ml-2 rounded-lg border border-slate-300 bg-white p-2.5"><option value="all">Semua status</option><option value="unpaid">Belum dibayar</option><option value="paid">Sudah dibayar</option><option value="review">Data lama belum ditetapkan</option></select></label>
        <p class="text-sm text-slate-600">{{ selectedGroups.length }} nota dipilih · {{ number(selectedGroups.reduce((sum, group) => sum + group.yard, 0)) }} yard</p>
    </div>
    <div v-if="!form" class="flex flex-wrap gap-2">
        <button type="button" @click="openForm('pay')" :disabled="!canAct || !selectedGroups.length" class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">Catat pembayaran terpilih</button>
        <button type="button" @click="openForm('legacy_paid')" :disabled="!canAct || !selectedGroups.length" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Sudah dibayar sebelumnya</button>
        <button type="button" @click="openForm('mark_unpaid')" :disabled="!canAct || !selectedGroups.length" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50">Tetapkan belum dibayar</button>
    </div>
    <form v-if="form" @submit.prevent="save" class="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
        <div><h4 class="font-bold text-slate-900">{{ form.mode === 'pay' ? 'Catat pembayaran operasional' : form.mode === 'legacy_paid' ? 'Tandai pembayaran sebelumnya' : 'Tetapkan biaya yang belum dibayar' }}</h4><p class="mt-1 text-sm text-slate-600">{{ selectedGroups.length }} nota · {{ number(formYard) }} yard × {{ money(form.rate) }} = <strong>{{ money(formAmount) }}</strong></p></div>
        <div class="grid gap-3 sm:grid-cols-3"><label v-if="form.mode !== 'mark_unpaid'" class="text-sm font-semibold text-slate-700">Tanggal pembayaran<input type="date" v-model="form.date" :disabled="saving" required class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"></label><label class="text-sm font-semibold text-slate-700">Tarif operasional (Rp/yard)<input type="number" v-model.number="form.rate" :disabled="saving" min="1" max="1000000" step="1" required class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"></label><label class="text-sm font-semibold text-slate-700">Catatan (opsional)<input v-model="form.note" :disabled="saving" maxlength="1000" class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" placeholder="Contoh: transport belanja kain"></label></div>
        <p class="text-sm font-medium text-indigo-900">{{ form.mode === 'pay' ? 'Saat disimpan, biaya ini dicatat sebagai Pengeluaran Produksi di Keuangan. Panjang kain yang sudah dibayar tidak ditagihkan lagi.' : form.mode === 'legacy_paid' ? 'Gunakan hanya untuk biaya yang sudah Anda bayar sebelumnya. Status menjadi Sudah dibayar tanpa membuat pengeluaran baru.' : 'Status menjadi Belum dibayar. Belum ada pengeluaran yang dicatat sampai Anda mencatat pembayarannya.' }}</p>
        <p v-if="selectedGroups.length > 50" class="text-sm font-semibold text-red-700">Pilih maksimal 50 nota per proses.</p>
        <div class="flex flex-wrap justify-end gap-2"><button type="button" @click="closeForm" :disabled="saving" class="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-600">Batal</button><button type="submit" :disabled="!canSubmit" class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">{{ saving ? 'Menyimpan…' : form.mode === 'pay' ? 'Simpan pembayaran & catat ke Keuangan' : form.mode === 'legacy_paid' ? 'Tandai sudah dibayar — tanpa pengeluaran baru' : 'Simpan status belum dibayar' }}</button></div>
    </form>
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table class="w-full text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3"><label class="flex items-center gap-2"><input type="checkbox" :checked="allSelected" @change="toggleAll($event.target.checked)" :disabled="!canAct || Boolean(form) || !eligible.length" aria-label="Pilih semua nota yang dapat dicatat">Pilih</label></th><th class="p-3">Tanggal / nota</th><th class="p-3">Kain / toko</th><th class="p-3 text-right">Panjang dibeli</th><th class="p-3 text-right">Tarif / yard</th><th class="p-3 text-right">Biaya operasional</th><th class="p-3">Status</th><th class="p-3">Aksi</th></tr></thead><tbody class="divide-y divide-slate-100">
        <tr v-if="loading"><td colspan="8" class="p-6 text-center text-slate-500">Memuat status pembayaran…</td></tr>
        <tr v-else-if="!visibleGroups.length"><td colspan="8" class="p-6 text-center text-slate-500">Tidak ada nota yang sesuai filter.</td></tr>
        <tr v-for="group in loading ? [] : visibleGroups" :key="group.purchaseId" class="align-top"><td class="p-3"><input type="checkbox" :value="group.purchaseId" v-model="selectedIds" :disabled="!canAct || Boolean(form) || group.status === 'paid' || group.archived" :aria-label="'Pilih nota ' + group.code"></td><td class="p-3"><p>{{ formatDate(group.date) }}</p><p class="mt-1 font-mono font-bold text-indigo-700">{{ group.code }}</p><p v-if="group.archived" class="mt-1 text-xs text-slate-400">Data stok telah dihapus</p></td><td class="p-3"><p class="font-semibold text-slate-800">{{ group.names }}</p><p class="mt-1 text-xs text-slate-500">{{ group.store }}</p></td><td class="p-3 text-right font-semibold">{{ number(group.yard) }} yard</td><td class="p-3 text-right">{{ money(group.rate) }}</td><td class="p-3 text-right font-bold text-indigo-700">{{ money(group.amount) }}</td><td class="p-3"><span class="inline-block rounded-full px-2.5 py-1 text-xs font-bold" :class="group.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : group.status === 'unpaid' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'">{{ group.status === 'paid' ? 'Sudah dibayar' : group.status === 'unpaid' ? 'Belum dibayar' : 'Belum ditetapkan' }}</span><template v-if="group.status === 'paid'"><p class="mt-2 text-xs text-slate-500">{{ formatDate(group.record.paidDate) }}</p><p class="mt-1 text-xs text-emerald-700">{{ group.record.financeRecordId ? 'Tercatat di Keuangan · Produksi' : 'Dibayar sebelumnya' }}</p></template></td><td class="p-3"><button v-if="group.status !== 'paid'" type="button" @click="openForm('pay', group)" :disabled="!canAct || Boolean(form)" class="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-50">Catat pembayaran</button><template v-else><p class="text-xs font-semibold text-emerald-700">Lunas</p><button v-if="!group.record.financeRecordId && !group.archived" type="button" @click="correctLegacy(group)" :disabled="!canAct || Boolean(form)" class="mt-2 text-left text-xs font-semibold text-slate-500 underline disabled:opacity-50">Koreksi: belum dibayar</button></template></td></tr>
    </tbody></table></div>
    </template>
</section>
</template>
<script setup>
/* global defineProps, defineEmits */
import { computed, onMounted, ref, watch } from 'vue';
import { buildShoppingGroups, summarizeShoppingGroups, shoppingAmount, shoppingDate } from '../fabric-shopping-operations.js';
import { filterFabricHistory } from '../fabric-warehouse.js';
import { fabricShoppingRequest } from '../fabric-shopping-api.js';
const props = defineProps({ rows: { type: Array, default: () => [] }, userId: { type: String, default: '' }, subscriptionActive: { type: Boolean, default: true } });
const emit = defineEmits(['updated', 'refresh-stock']);
const records = ref([]), loading = ref(true), loaded = ref(false), saving = ref(false), error = ref(''), message = ref('');
const period = ref('all'), start = ref(''), end = ref(''), search = ref(''), statusFilter = ref('all'), selectedIds = ref([]), form = ref(null);
const number = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 6 });
const money = value => Number(value || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const formatDate = value => shoppingDate(value)?.toLocaleDateString('id-ID') || '—';
const today = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value])); return parts.year + '-' + parts.month + '-' + parts.day; };
const groups = computed(() => buildShoppingGroups(props.rows, records.value));
const periodGroups = computed(() => {
    const filtered = filterFabricHistory(groups.value.map(group => ({ ...group, tanggalBeli: group.date })), { period: period.value, start: start.value, end: end.value });
    const term = search.value.trim().toLowerCase();
    return filtered.filter(group => !term || [group.code, group.names, group.store].some(value => value.toLowerCase().includes(term)));
});
const summary = computed(() => summarizeShoppingGroups(periodGroups.value));
const visibleGroups = computed(() => periodGroups.value.filter(group => statusFilter.value === 'all' || group.status === statusFilter.value));
const eligible = computed(() => visibleGroups.value.filter(group => group.status !== 'paid' && !group.archived && group.yard > 0));
const selectedGroups = computed(() => eligible.value.filter(group => selectedIds.value.includes(group.purchaseId)));
const allSelected = computed(() => eligible.value.length > 0 && eligible.value.every(group => selectedIds.value.includes(group.purchaseId)));
const canAct = computed(() => loaded.value && !loading.value && !saving.value && props.subscriptionActive && Boolean(props.userId));
const formYard = computed(() => selectedGroups.value.reduce((sum, group) => sum + group.yard, 0));
const formAmount = computed(() => selectedGroups.value.reduce((sum, group) => sum + shoppingAmount(group.yard, form.value?.rate), 0));
const canSubmit = computed(() => canAct.value && form.value && selectedGroups.value.length > 0 && selectedGroups.value.length <= 50 && Number.isSafeInteger(form.value.rate) && form.value.rate > 0 && form.value.rate <= 1000000 && Number.isSafeInteger(formAmount.value) && formAmount.value > 0 && (form.value.mode === 'mark_unpaid' || Boolean(form.value.date)));
watch(visibleGroups, () => { const valid = new Set(eligible.value.map(group => group.purchaseId)); selectedIds.value = selectedIds.value.filter(id => valid.has(id)); });
watch(() => props.userId, () => { records.value = []; selectedIds.value = []; form.value = null; loaded.value = false; saving.value = false; void load(); });
async function load() {
    const uid = props.userId; if (!uid) { loading.value = false; return; }
    loading.value = true; loaded.value = false; error.value = '';
    try { const result = await fabricShoppingRequest(uid, { action: 'list' }); if (uid !== props.userId) return; records.value = result.records; loaded.value = true; }
    catch (issue) { if (uid === props.userId) error.value = issue.message; }
    finally { if (uid === props.userId) loading.value = false; }
}
async function refresh() { if (saving.value) return; closeForm(); await load(); emit('refresh-stock'); }
function toggleAll(checked) { if (canAct.value && !form.value) selectedIds.value = checked ? eligible.value.map(group => group.purchaseId) : []; }
function openForm(mode, group) {
    if (!canAct.value || form.value) return;
    if (group) selectedIds.value = [group.purchaseId];
    if (!selectedGroups.value.length) return;
    const rates = [...new Set(selectedGroups.value.map(row => row.rate))];
    form.value = { mode, date: today(), rate: rates.length === 1 ? rates[0] : 100, note: '' }; error.value = ''; message.value = '';
}
function closeForm() { if (!saving.value) form.value = null; }
async function save() {
    if (!canSubmit.value) return;
    const uid = props.userId, mode = form.value.mode;
    const input = { action: mode, date: form.value.date, note: form.value.note, purchases: selectedGroups.value.map(group => ({ purchaseId: group.purchaseId, yard: group.yard, rate: form.value.rate })) };
    saving.value = true; error.value = ''; message.value = '';
    try {
        const result = await fabricShoppingRequest(uid, input); if (uid !== props.userId) return;
        const merged = new Map(records.value.map(record => [record.purchaseId, record])); result.records.forEach(record => merged.set(record.purchaseId, record)); records.value = [...merged.values()];
        emit('updated', result); form.value = null; selectedIds.value = [];
        message.value = result.alreadyPaid ? 'Pembayaran sudah tercatat sebelumnya. Pengeluaran tidak dibuat ulang.' : mode === 'pay' ? 'Pembayaran ' + money(result.expense.jumlah) + ' tersimpan di Keuangan sebagai pengeluaran Produksi.' : mode === 'legacy_paid' ? 'Ditandai sudah dibayar sebelumnya. Tidak ada pengeluaran baru yang dibuat.' : 'Status belum dibayar tersimpan. Belum ada pengeluaran yang dibuat.';
    } catch (issue) { if (uid === props.userId) error.value = issue.message; }
    finally { if (uid === props.userId) saving.value = false; }
}
async function correctLegacy(group) {
    if (!canAct.value || form.value || group.archived) return;
    if (!window.confirm('Ubah status nota ' + group.code + ' menjadi Belum dibayar? Ini hanya mengoreksi penandaan pembayaran lama.')) return;
    const uid = props.userId; saving.value = true; error.value = ''; message.value = '';
    try {
        const result = await fabricShoppingRequest(uid, { action: 'reopen_legacy', purchases: [{ purchaseId: group.purchaseId, yard: group.currentYard, rate: group.rate }] });
        if (uid !== props.userId) return;
        const merged = new Map(records.value.map(record => [record.purchaseId, record])); result.records.forEach(record => merged.set(record.purchaseId, record)); records.value = [...merged.values()];
        emit('updated', result); message.value = 'Status pembayaran lama dikoreksi menjadi Belum dibayar.';
    } catch (issue) { if (uid === props.userId) error.value = issue.message; }
    finally { if (uid === props.userId) saving.value = false; }
}
onMounted(load);
</script>
