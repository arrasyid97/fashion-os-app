<template>
    <div class="space-y-5">
        <header class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p class="text-xs font-bold uppercase tracking-wide" :class="brandText">Pesanan marketplace</p>
            <h1 class="mt-2 text-2xl font-bold text-slate-900">Impor Pesanan Terkirim {{ platformName }}</h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Unggah ekspor <b>Perlu dikirim</b>, tandai pesanan yang belum berangkat, lalu konfirmasi sisanya. Stok Inventaris baru berkurang setelah Anda mengonfirmasi pengiriman.</p>
            <ol class="mt-4 grid gap-2 text-sm sm:grid-cols-3"><li class="rounded-lg bg-slate-50 p-3"><b>1. Upload file</b><p class="mt-1 text-xs text-slate-500">Pesanan baru otomatis Siap kirim; stok tetap.</p></li><li class="rounded-lg bg-slate-50 p-3"><b>2. Tunda yang belum dikirim</b><p class="mt-1 text-xs text-slate-500">Ubah pilihan Siap kirim menjadi Ditunda, atau cari dari tiga karakter terakhir ID.</p></li><li class="rounded-lg bg-slate-50 p-3"><b>3. Konfirmasi pengiriman</b><p class="mt-1 text-xs text-slate-500">Pesanan Siap kirim diproses; yang Ditunda tetap tersimpan.</p></li></ol>
        </header>
        <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="grid items-start gap-4 md:grid-cols-2">
                <label class="text-sm font-semibold text-slate-700">Toko {{ platformName }}
                    <select v-model="channelId" :disabled="Boolean(rawOrders.length) || busy || loadingFile || checking" class="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 disabled:bg-slate-50"><option value="" disabled>Pilih toko {{ platformName }}</option><option v-for="channel in channels" :key="channel.id" :value="String(channel.id)">{{ channel.name }}</option></select>
                    <span v-if="!channels.length" class="mt-1 block text-xs text-amber-700">Tambahkan marketplace {{ platformName }} di Pengaturan terlebih dahulu.</span>
                </label>
                <label class="text-sm font-semibold text-slate-700">File ekspor {{ platformName }}
                    <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" :disabled="!channelId || busy || loadingFile || checking" @change="handleFile" class="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-50">
                    <span class="mt-1 block text-xs font-normal text-slate-500">{{ platform === 'shopee' ? 'Contoh: Order.toship.20261015_20261114.xlsx' : 'Contoh: Untuk Dikirim pesanan-2026-11-14-17_29.xlsx' }}</span>
                </label>
            </div>
            <label v-if="sheetChoices.length > 1" class="mt-3 block text-sm text-slate-700">Tab data<select v-model="selectedSheet" @change="changeSheet" :disabled="busy || checking || loadingFile" class="ml-2 rounded-lg border p-2"><option v-for="sheet in sheetChoices" :key="sheet.name" :value="sheet.name">{{ sheet.name }}</option></select></label>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><p class="break-all text-xs text-slate-500">{{ fileName ? 'File terakhir: ' + fileName : 'Unggah file ekspor untuk memulai.' }}</p><button @click="clearDraft" :disabled="busy || loadingFile || checking" class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Muat ulang / kosongkan daftar</button></div>
            <p class="mt-2 text-xs text-slate-500">Salah upload? Kosongkan daftar lalu unggah file pengganti. Status Ditunda tetap diingat saat ID yang sama diunggah lagi. Pesanan yang sudah dikirim otomatis dilewati.</p>
            <p v-if="fileError" role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ fileError }}</p>
            <p v-if="storageError" role="alert" class="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{{ storageError }}</p>
            <p v-if="warnings.length" role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ warnings.join(' ') }} Konfirmasi dikunci sampai file diperbaiki.</p>
            <p v-if="error" role="alert" class="mt-3 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p><p v-if="message" role="status" aria-live="polite" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ message }}</p>
        </section>
        <template v-if="rawOrders.length">
            <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <article class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">Terbaca di antrean</p><p class="mt-1 text-xl font-bold">{{ orders.length }} pesanan</p><p class="mt-1 text-xs text-slate-500">{{ totalQty }} pcs</p></article>
                <article class="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p class="text-xs text-emerald-700">Akan dikonfirmasi</p><p class="mt-1 text-xl font-bold text-emerald-900">{{ candidates.length }} pesanan</p><p class="mt-1 text-xs text-emerald-700">{{ candidateQty }} pcs</p></article>
                <article class="rounded-xl border border-amber-200 bg-amber-50 p-4"><p class="text-xs text-amber-700">Ditunda</p><p class="mt-1 text-xl font-bold text-amber-900">{{ deferredCount }} pesanan</p><p class="mt-1 text-xs text-amber-700">Stok belum dikurangi</p></article>
                <article class="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><p class="text-xs text-indigo-700">Sudah dikirim</p><p class="mt-1 text-xl font-bold text-indigo-900">{{ completedHere.length }} pesanan</p><p class="mt-1 text-xs text-indigo-700">Dikeluarkan dari antrean impor</p></article>
            </section>
            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="relative">
                    <label for="dispatch-exclusion-search" class="block text-sm font-bold text-slate-800">Cari pesanan yang belum dikirim</label>
                    <input id="dispatch-exclusion-search" ref="searchInput" v-model="search" :disabled="busy" @keydown.down.prevent="moveSuggestion(1)" @keydown.up.prevent="moveSuggestion(-1)" @keydown.enter.prevent="chooseSuggestion" @keydown.esc="search = ''" autocomplete="off" placeholder="Ketik 3 karakter terakhir ID pesanan, atau tempel ID lengkap" class="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none" role="combobox" :aria-expanded="Boolean(suggestions.length)" aria-controls="dispatch-suggestions">
                    <p class="mt-2 text-xs text-slate-500">Pilih rekomendasi lalu pesanan masuk daftar Ditunda. Jika akhir ID sama, pilih ID lengkap yang benar. Scanner ID lengkap atau resi juga bisa dipakai di sini.</p>
                    <ul v-if="search.trim().length >= 3" id="dispatch-suggestions" class="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200" role="listbox">
                        <li v-if="!suggestions.length" class="p-3 text-sm text-slate-500">Tidak ada ID dengan akhiran tersebut.</li>
                        <li v-for="(order, index) in suggestions.slice(0, 20)" :key="order.key" role="option" :aria-selected="suggestionIndex === index" class="flex items-center justify-between gap-3 border-b p-3 last:border-0" :class="suggestionIndex === index ? 'bg-indigo-50' : 'bg-white'">
                            <div class="min-w-0"><p class="break-all font-mono text-sm font-bold">{{ order.orderId.slice(0, -3) }}<mark class="rounded bg-amber-100 px-0.5">{{ order.orderId.slice(-3) }}</mark></p><p class="mt-1 truncate text-xs text-slate-500">{{ order.items.map(item => item.sellerSku + ' ×' + item.qty).join(' · ') }}</p></div>
                            <button v-if="!isConfirmed(order) && !order.excludedReason" type="button" @click="deferOrder(order)" class="shrink-0 rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">{{ isDeferred(order) ? 'Sudah ditunda' : 'Tunda' }}</button><span v-else class="shrink-0 text-xs text-slate-500">{{ isConfirmed(order) ? 'Sudah tercatat' : 'Tidak disertakan' }}</span>
                        </li>
                    </ul>
                    <p v-if="searchMessage" class="mt-2 text-xs text-amber-800" role="status">{{ searchMessage }}</p>
                </div>
            </section>
            <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div class="flex flex-wrap gap-2"><button v-for="tab in tabs" :key="tab.value" @click="view = tab.value" :class="view === tab.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'" class="rounded-lg px-3 py-2 text-xs font-bold">{{ tab.label }}</button></div>
                    <button @click="refreshProducts" :disabled="busy || loadingFile || checking" class="text-xs font-bold text-indigo-700">Perbarui stok dan pencocokan</button>
                </div>
                <div class="overflow-x-auto"><table class="w-full min-w-[840px] text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">ID pesanan / resi</th><th class="p-3">SKU, warna, ukuran</th><th class="p-3 text-right">Pcs</th><th class="p-3">Status</th><th class="p-3 text-center">Aksi</th></tr></thead><tbody class="divide-y divide-slate-100">
                    <tr v-for="order in visibleOrders" :key="order.key" :class="isDeferred(order) ? 'bg-amber-50/50' : ''">
                        <td class="p-3 align-top"><p class="break-all font-mono font-semibold">{{ order.orderId }}</p><p v-for="id in order.trackingNumbers" :key="id" class="mt-1 text-xs text-slate-500">{{ id }}</p></td>
                        <td class="p-3 align-top"><div v-for="item in order.items" :key="item.key" class="mb-3 last:mb-0"><p class="font-semibold text-slate-800">{{ item.sellerSku || item.name || 'SKU kosong' }}</p><p class="mt-1 text-xs text-slate-500">{{ item.color }} · {{ item.size }} · {{ item.qty }} pcs</p><p v-if="item.product" class="mt-1 text-xs text-emerald-700">Inventaris: {{ item.product.name }} · {{ item.product.color }} · {{ item.product.size }} · stok {{ item.product.stock }}</p><p v-for="issue in item.issues" :key="issue" class="mt-1 text-xs text-red-600">{{ issue }}</p>
                            <button v-if="!isConfirmed(order) && !order.excludedReason" @click="openMapping(order, item)" :disabled="busy" class="mt-1 text-xs font-semibold text-indigo-700 hover:underline">{{ item.product ? 'Ubah pencocokan' : 'Cocokkan produk Inventaris' }}</button>
                            <div v-if="mappingKey === order.key + ':' + item.key" class="mt-2 space-y-2 rounded-lg bg-slate-50 p-2"><input v-model="mappingSearch" :disabled="busy" placeholder="Cari SKU / nama / warna / ukuran" class="w-full rounded border p-2 text-xs"><select :value="overrides[mappingKey] || item.product?.id || ''" :disabled="busy" @change="setMapping($event.target.value)" class="w-full rounded border p-2 text-xs"><option value="">Pilih produk yang benar</option><option v-for="product in mappingOptions" :key="product.id" :value="product.id">{{ product.sku }} · {{ product.modelName }} · {{ product.color }} · {{ product.size }}</option></select><button @click="mappingKey = ''" class="text-xs font-semibold text-slate-600">Tutup pencocokan</button></div>
                        </div><p v-if="serverErrors[order.key]" class="mt-1 text-xs text-red-600">{{ serverErrors[order.key] }}</p></td>
                        <td class="p-3 text-right align-top font-bold">{{ order.qty }}</td>
                        <td class="p-3 align-top"><span class="rounded-full px-2 py-1 text-xs font-semibold" :class="isConfirmed(order) ? 'bg-indigo-50 text-indigo-700' : isDeferred(order) ? 'bg-amber-100 text-amber-900' : order.excludedReason || order.issues.length || serverErrors[order.key] ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'">{{ statusLabel(order) }}</span><p v-if="order.excludedReason" class="mt-2 max-w-52 text-xs text-slate-500">{{ order.excludedReason }}</p></td>
                        <td class="p-3 text-center align-top"><select v-if="!isConfirmed(order) && !order.excludedReason" :value="isDeferred(order) ? 'deferred' : 'ready'" @change="setShippingStatus(order, $event.target.value)" :disabled="busy || loadingFile || checking" :aria-label="'Status pengiriman ' + order.orderId" class="rounded-lg border px-2 py-2 text-xs font-bold disabled:opacity-50" :class="isDeferred(order) ? 'border-amber-200 bg-amber-100 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"><option value="ready">Siap kirim</option><option value="deferred">Ditunda</option></select><span v-else class="text-xs text-slate-400">{{ isConfirmed(order) ? 'Sudah tercatat' : 'Dilewati' }}</span></td>
                    </tr><tr v-if="!visibleOrders.length"><td colspan="5" class="p-6 text-center text-slate-500">Tidak ada pesanan pada tampilan ini.</td></tr>
                </tbody></table></div>
                <div class="flex items-center justify-between gap-3 border-t p-3 text-xs text-slate-500"><span>{{ filteredOrders.length }} pesanan · halaman {{ page }} / {{ pageCount }}</span><div class="flex gap-2"><button @click="page--" :disabled="page <= 1" class="rounded border px-3 py-1 disabled:opacity-40">Sebelumnya</button><button @click="page++" :disabled="page >= pageCount" class="rounded border px-3 py-1 disabled:opacity-40">Berikutnya</button></div></div>
            </section>
            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p v-if="candidateProblems" class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ candidateProblems }} pesanan masih perlu diperiksa. Cocokkan produknya atau tandai Ditunda agar pesanan lain bisa dikonfirmasi.</p>
                <div v-if="shortages.length" class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><b>Stok tampak belum cukup:</b><p v-for="item in shortages.slice(0, 10)" :key="item.id" class="mt-1 text-xs">{{ item.name }} · {{ item.color }} · {{ item.size }}: stok {{ item.stock }}, dibutuhkan {{ item.qty }} pcs.</p><p class="mt-2 text-xs">Tambahkan stok atau tunda pesanan terkait. Stok terbaru akan diperiksa kembali saat konfirmasi.</p></div>
                <div class="flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-semibold text-slate-700">Tanggal pengiriman<input type="date" v-model="shipDate" :disabled="busy" required class="mt-1 block rounded-lg border border-slate-300 p-2.5"></label><div class="text-right"><p class="text-sm font-semibold text-slate-800">{{ candidates.length }} pesanan · {{ candidateQty }} pcs akan dikirim</p><p class="mt-1 text-xs text-slate-500">{{ deferredCount }} pesanan ditunda tidak mengurangi stok.</p><button @click="confirmOrders" :disabled="!canConfirm" class="mt-3 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">{{ busy ? 'Memproses… ' + completedThisRun : 'Konfirmasi dikirim & kurangi stok' }}</button></div></div>
                <p v-if="checking" class="mt-3 text-xs text-slate-500">Memeriksa pesanan yang sudah pernah tercatat…</p><p v-if="!subscriptionActive" class="mt-3 text-sm text-amber-800">Langganan belum aktif untuk konfirmasi pengiriman.</p>
                <p class="mt-4 text-xs text-slate-500">Upload tidak mengubah stok. Setiap pesanan diperiksa ulang agar konfirmasi atau upload berulang tidak mengurangi stok dua kali.</p>
            </section>
        </template>
    </div>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { dispatchKey, dispatchPlatform, dispatchProductInfo, findDispatchSheets, parseDispatchSheet, resolveDispatchOrders, searchDispatchOrders, dispatchStockNeeds } from '../marketplace-dispatch.js';
const props = defineProps({ platform: { type: String, required: true }, products: { type: Array, default: () => [] }, marketplaces: { type: Array, default: () => [] }, userId: { type: String, default: '' }, subscriptionActive: { type: Boolean, default: true } });
const emit = defineEmits(['completed', 'refresh-products']);
const platformName = computed(() => props.platform === 'shopee' ? 'Shopee' : 'TikTok');
const brandText = computed(() => props.platform === 'shopee' ? 'text-orange-600' : 'text-slate-800');
const channels = computed(() => props.marketplaces.filter(channel => dispatchPlatform(channel.name) === props.platform));
const channelId = ref(''); const fileInput = ref(null); const fileName = ref(''); const fileError = ref(''); const warnings = ref([]); const storageError = ref('');
const rawOrders = ref([]); const deferred = ref([]); const confirmed = ref([]); const completedHere = ref([]); const overrides = ref({}); const models = ref([]); const serverErrors = ref({});
const sheetChoices = ref([]); const selectedSheet = ref(''); const search = ref(''); const searchInput = ref(null); const searchMessage = ref(''); const suggestionIndex = ref(-1);
const mappingKey = ref(''); const mappingSearch = ref(''); const view = ref('all'); const page = ref(1); const busy = ref(false); const loadingFile = ref(false); const checking = ref(false); const completedThisRun = ref(0); const error = ref(''); const message = ref('');
const today = () => { const date = new Date(); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); };
const shipDate = ref(today()); let restoring = false; let queueRevision = 0; let checkVersion = 0;
const storageKey = computed(() => 'fashion-os-dispatch-v2:' + props.userId + ':' + props.platform);
const tabs = [{ value: 'all', label: 'Semua' }, { value: 'ready', label: 'Siap kirim' }, { value: 'deferred', label: 'Ditunda' }, { value: 'review', label: 'Perlu diperiksa' }];
const orders = computed(() => resolveDispatchOrders(rawOrders.value, props.products, models.value, overrides.value));
const isConfirmed = order => confirmed.value.includes(order.key);
const isDeferred = order => deferred.value.includes(order.key);
const candidates = computed(() => orders.value.filter(order => !isConfirmed(order) && !isDeferred(order) && !order.excludedReason));
const candidateProblems = computed(() => candidates.value.filter(order => order.issues.length || serverErrors.value[order.key]).length);
const candidateQty = computed(() => candidates.value.reduce((sum, order) => sum + order.qty, 0));
const totalQty = computed(() => orders.value.reduce((sum, order) => sum + order.qty, 0));
const deferredCount = computed(() => orders.value.filter(order => isDeferred(order) && !isConfirmed(order) && !order.excludedReason).length);
const shortages = computed(() => dispatchStockNeeds(candidates.value).filter(item => item.qty > item.stock));
const suggestions = computed(() => searchDispatchOrders(orders.value, search.value));
const canConfirm = computed(() => !busy.value && !checking.value && !loadingFile.value && !fileError.value && props.userId && props.subscriptionActive && channelId.value && shipDate.value && candidates.value.length > 0 && !candidateProblems.value && !warnings.value.length);
const statusLabel = order => isConfirmed(order) ? 'Sudah tercatat' : order.excludedReason ? 'Tidak disertakan' : isDeferred(order) ? 'Ditunda' : order.issues.length || serverErrors.value[order.key] ? 'Perlu diperiksa' : 'Siap kirim';
const filteredOrders = computed(() => orders.value.filter(order => view.value === 'all' || (view.value === 'ready' ? !isDeferred(order) && !order.excludedReason : view.value === 'deferred' ? isDeferred(order) && !order.excludedReason : !isDeferred(order) && (order.issues.length || serverErrors.value[order.key]))));
const pageCount = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / 25))); const visibleOrders = computed(() => filteredOrders.value.slice((page.value - 1) * 25, page.value * 25));
const mappingOptions = computed(() => props.products.map(product => dispatchProductInfo(product, models.value)).filter(product => !mappingSearch.value || dispatchKey([product.sku, product.modelName, product.color, product.size].join(' ')).includes(dispatchKey(mappingSearch.value))).slice(0, 200));
watch([search, view], () => { suggestionIndex.value = -1; searchMessage.value = ''; page.value = 1; });
watch(pageCount, count => { if (page.value > count) page.value = count; });
function persistDraft() {
    if (restoring || !props.userId) return;
    try { localStorage.setItem(storageKey.value, JSON.stringify({ userId: props.userId, platform: props.platform, channelId: channelId.value, orders: rawOrders.value, deferred: deferred.value, confirmed: confirmed.value, completedHere: completedHere.value, overrides: overrides.value, fileName: fileName.value, warnings: warnings.value, savedOn: today(), shipDate: shipDate.value })); storageError.value = ''; }
    catch (_) { storageError.value = 'Antrean belum tersimpan di perangkat. Jangan tutup halaman sebelum selesai atau simpan kembali file ekspor Anda.'; }
}
watch([rawOrders, deferred, confirmed, overrides, channelId, shipDate], persistDraft, { deep: true, flush: 'sync' });
function loadDraft() {
    restoring = true; queueRevision++; checkVersion++; checking.value = false;
    let draftLoaded = false;
    rawOrders.value = []; deferred.value = []; confirmed.value = []; completedHere.value = []; overrides.value = {}; serverErrors.value = {}; warnings.value = []; fileName.value = ''; models.value = []; error.value = ''; message.value = ''; fileError.value = ''; sheetChoices.value = []; selectedSheet.value = ''; search.value = ''; mappingKey.value = ''; mappingSearch.value = ''; view.value = 'all'; page.value = 1; shipDate.value = today();
    channelId.value = String(channels.value[0]?.id || '');
    try {
        const data = JSON.parse(localStorage.getItem(storageKey.value) || 'null');
        if (data?.userId === props.userId && data.platform === props.platform && Array.isArray(data.orders) && channels.value.some(channel => String(channel.id) === String(data.channelId))) {
            draftLoaded = true;
            channelId.value = String(data.channelId); rawOrders.value = data.orders; deferred.value = Array.isArray(data.deferred) ? data.deferred : []; confirmed.value = Array.isArray(data.confirmed) ? data.confirmed : []; completedHere.value = Array.isArray(data.completedHere) ? data.completedHere : []; overrides.value = data.overrides || {}; fileName.value = data.fileName || ''; warnings.value = data.warnings || []; shipDate.value = data.savedOn === today() ? data.shipDate || today() : today();
        }
    } catch (_) { storageError.value = 'Antrean tersimpan tidak dapat dibaca. Upload ulang file ekspor.'; }
    rememberConfirmed([]); restoring = false; if (draftLoaded) persistDraft();
}
function rememberConfirmed(keys) {
    const known = new Set([...confirmed.value, ...keys]);
    const removed = rawOrders.value.filter(order => known.has(order.key)).map(order => order.key);
    confirmed.value = [...known]; completedHere.value = [...new Set([...completedHere.value, ...removed])];
    rawOrders.value = rawOrders.value.filter(order => !known.has(order.key));
    deferred.value = deferred.value.filter(orderKey => !known.has(orderKey));
    persistDraft();
}
async function loadModels() {
    const uid = props.userId; if (!uid) return;
    try { const snap = await getDoc(doc(db, 'settings', uid)); if (props.userId === uid) models.value = snap.exists() ? snap.data().modelProduk || [] : []; }
    catch (_) { if (props.userId === uid) error.value = 'Daftar model belum dapat dimuat. Gunakan Muat ulang stok dan pencocokan.'; }
}
async function apiRequest(body) {
    const user = auth.currentUser; if (!user || user.uid !== props.userId) throw new Error('Sesi akun belum siap. Silakan masuk kembali.');
    const token = await user.getIdToken(); const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch('/api/confirm-marketplace-dispatch', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, platform: props.platform, channelId: channelId.value }), signal: controller.signal, cache: 'no-store' });
        const data = await response.json().catch(() => ({})); if (!response.ok) { const issue = new Error(data.message || 'Permintaan belum berhasil (' + response.status + ').'); Object.assign(issue, data); throw issue; } return data;
    } catch (issue) { if (issue.name === 'AbortError') throw new Error('Koneksi terputus atau melewati batas waktu. Coba konfirmasi lagi; pesanan yang sudah tercatat akan dilewati.'); throw issue; }
    finally { window.clearTimeout(timer); }
}
async function checkExisting() {
    if (!rawOrders.value.length || !channelId.value || !props.userId) return;
    const uid = props.userId; const channel = channelId.value; const revision = queueRevision; const version = ++checkVersion;
    const pending = [...rawOrders.value]; checking.value = true; serverErrors.value = {};
    try {
        for (let offset = 0; offset < pending.length; offset += 200) {
            const data = await apiRequest({ action: 'check', orderIds: pending.slice(offset, offset + 200).map(order => order.orderId) });
            if (uid !== props.userId || channel !== channelId.value || revision !== queueRevision || version !== checkVersion) return;
            rememberConfirmed(data.alreadyRecorded.map(dispatchKey));
            for (const issue of data.uncertain || []) serverErrors.value[dispatchKey(issue.orderId)] = issue.message;
        }
    } catch (issue) { if (uid === props.userId && revision === queueRevision && version === checkVersion) error.value = issue.message; }
    finally { if (version === checkVersion) checking.value = false; }
}
onMounted(() => { loadDraft(); loadModels(); checkExisting(); });
watch(() => props.userId, () => { loadDraft(); loadModels(); checkExisting(); });
watch(channels, () => { if (!channelId.value && !rawOrders.value.length) { loadDraft(); loadModels(); checkExisting(); } });
async function handleFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy.value || loadingFile.value || checking.value) return;
    fileError.value = ''; error.value = ''; message.value = '';
    const uid = props.userId; loadingFile.value = true;
    try {
        if (file.size > 30 * 1024 * 1024) throw new Error('Ukuran file maksimal 30 MB.');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        if (uid !== props.userId) return;
        const choices = findDispatchSheets(workbook, XLSX, props.platform);
        sheetChoices.value = choices; selectedSheet.value = choices[0].name; fileName.value = file.name;
        const parsed = applySheet(); if (parsed) { await checkExisting(); if (uid === props.userId) describeUpload(parsed); }
    } catch (issue) { if (uid === props.userId) fileError.value = issue.message || 'File tidak dapat dibaca.'; }
    finally { loadingFile.value = false; }
}
function applySheet() {
    const selected = sheetChoices.value.find(sheet => sheet.name === selectedSheet.value); if (!selected) return;
    const parsed = parseDispatchSheet(selected, props.platform); if (!parsed.orders.length) { fileError.value = 'Tidak ada pesanan yang dapat dibaca pada tab ini.'; return; }
    queueRevision++; completedHere.value = parsed.orders.filter(isConfirmed).map(order => order.key);
    const merged = new Map(rawOrders.value.map(order => [order.key, order])); parsed.orders.forEach(order => merged.set(order.key, order)); rawOrders.value = [...merged.values()]; warnings.value = parsed.warnings;
    rememberConfirmed([]); view.value = 'all'; page.value = 1; mappingKey.value = ''; describeUpload(parsed); persistDraft();
    return parsed;
}
function describeUpload(parsed) { message.value = parsed.orders.length + ' pesanan / ' + parsed.qty + ' pcs terbaca dari file. ' + completedHere.value.length + ' pesanan sudah dikirim dan dilewati. Antrean tersisa ' + rawOrders.value.length + ' pesanan, termasuk ' + deferredCount.value + ' Ditunda. Stok belum berubah.'; }
async function changeSheet() { fileError.value = ''; const parsed = applySheet(); if (parsed) { await checkExisting(); describeUpload(parsed); } }
function deferOrder(order) { if (busy.value || loadingFile.value || checking.value || isConfirmed(order) || order.excludedReason) return; deferred.value = [...new Set([...deferred.value, order.key])]; search.value = ''; searchMessage.value = ''; nextTick(() => searchInput.value?.focus()); }
function restoreOrder(order) { if (!busy.value && !loadingFile.value && !checking.value) deferred.value = deferred.value.filter(key => key !== order.key); }
function setShippingStatus(order, status) { if (status === 'deferred') deferOrder(order); else if (status === 'ready') restoreOrder(order); }
function moveSuggestion(delta) { const count = Math.min(suggestions.value.length, 20); if (count) suggestionIndex.value = (suggestionIndex.value + delta + count) % count; }
function chooseSuggestion() { const list = suggestions.value.slice(0, 20); const order = list.length === 1 ? list[0] : suggestionIndex.value >= 0 ? list[suggestionIndex.value] : null; if (order) deferOrder(order); else if (list.length > 1) searchMessage.value = 'Ada beberapa ID dengan akhiran yang sama. Pilih pesanan yang benar.'; }
function openMapping(order, item) { mappingKey.value = order.key + ':' + item.key; mappingSearch.value = ''; }
function setMapping(productId) { if (busy.value) return; if (productId) overrides.value = { ...overrides.value, [mappingKey.value]: productId }; mappingKey.value = ''; }
function refreshProducts() { if (busy.value || loadingFile.value || checking.value) return; emit('refresh-products'); loadModels(); checkExisting(); }
function clearDraft() {
    if (busy.value || loadingFile.value || checking.value) return;
    restoring = true; queueRevision++; checkVersion++;
    rawOrders.value = []; completedHere.value = []; fileName.value = ''; warnings.value = []; serverErrors.value = {}; sheetChoices.value = []; selectedSheet.value = ''; search.value = ''; searchMessage.value = ''; suggestionIndex.value = -1; mappingKey.value = ''; mappingSearch.value = ''; fileError.value = ''; error.value = ''; view.value = 'all'; page.value = 1; shipDate.value = today();
    if (fileInput.value) fileInput.value.value = '';
    message.value = 'Daftar impor sudah dikosongkan. Silakan unggah file pengganti. Status Ditunda dan riwayat pesanan yang sudah dikirim tetap diingat.';
    restoring = false; persistDraft();
}
async function confirmOrders() {
    if (!canConfirm.value) return;
    const uid = props.userId; const selected = [...candidates.value]; busy.value = true; error.value = ''; message.value = ''; completedThisRun.value = 0;
    const batchId = 'DISPATCH-' + Date.now(); let duplicates = 0;
    try {
        for (let offset = 0; offset < selected.length; offset += 20) {
            const chunk = selected.slice(offset, offset + 20);
            const data = await apiRequest({ action: 'confirm', shipDate: shipDate.value, sourceFileName: fileName.value, batchId,
                orders: chunk.map(order => ({ orderId: order.orderId, packageIds: order.packageIds, trackingNumbers: order.trackingNumbers,
                    items: order.items.map(item => ({ productId: item.product.id, qty: item.qty, platformSellerSku: item.sellerSku, platformSkuId: item.platformSkuId, variasiEkspor: item.variation })) })) });
            if (uid !== props.userId) return;
            const transactions = data.transactions.map(record => ({ ...record, tanggal: new Date(record.tanggal), tanggalTerkirim: new Date(record.tanggalTerkirim), shipmentConfirmedAt: new Date(record.shipmentConfirmedAt) }));
            if (transactions.length) emit('completed', { transactions, stockDeltas: data.stockDeltas, stockAfter: data.stockAfter });
            duplicates += data.duplicateOrders.length; completedThisRun.value += transactions.length;
            rememberConfirmed(chunk.map(order => order.key));
            message.value = completedThisRun.value + ' pesanan dikonfirmasi. ' + deferredCount.value + ' pesanan ditunda tetap dalam antrean.';
        }
        message.value = completedThisRun.value + ' pesanan berhasil dikonfirmasi dan stok Inventaris diperbarui.' + (duplicates ? ' ' + duplicates + ' pesanan sudah pernah tercatat dan dilewati.' : '') + ' ' + deferredCount.value + ' pesanan ditunda tidak mengurangi stok.';
    } catch (issue) {
        if (uid === props.userId) { error.value = (completedThisRun.value ? completedThisRun.value + ' pesanan sudah berhasil. Pesanan sisanya belum dikonfirmasi. ' : '') + issue.message; if (issue.orderId) serverErrors.value[dispatchKey(issue.orderId)] = issue.message; }
    } finally { busy.value = false; }
}
</script>
