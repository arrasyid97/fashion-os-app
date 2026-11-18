<template>
<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4 sm:p-8"><div class="mx-auto max-w-7xl space-y-6">
<header><p class="text-sm font-semibold uppercase tracking-wide text-indigo-600">Penjualan</p><h1 class="mt-1 text-3xl font-bold text-slate-900">Riwayat Transaksi</h1><p class="mt-2 max-w-3xl text-sm text-slate-600">Pesanan yang sudah masuk Fashion OS dari hasil impor ekspor marketplace. Pesanan tetap tersimpan di sini setelah antrean scan dibersihkan.</p></header>
<section class="grid gap-4 sm:grid-cols-3"><article class="rounded-xl border bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-500">Transaksi tampil</p><p class="mt-1 text-2xl font-bold">{{ filtered.length }}</p></article><article class="rounded-xl border bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-500">Jumlah barang</p><p class="mt-1 text-2xl font-bold text-indigo-700">{{ totalQty }} pcs</p></article><article class="rounded-xl border bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-500">HPP transaksi tampil</p><p class="mt-1 text-2xl font-bold text-amber-700">{{ formatCurrency(totalHpp) }}</p></article></section>
<section class="rounded-2xl border bg-white p-5 shadow-sm"><div class="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
<label class="block"><span class="mb-1 block text-xs font-medium text-slate-600">Marketplace / toko</span><select v-model="channelFilter" class="w-full rounded-lg border p-2 text-sm"><option value="all">Semua toko</option><option v-for="channel in marketplaces" :key="channel.id" :value="String(channel.id)">{{ channel.name }}</option></select></label>
<label class="block"><span class="mb-1 block text-xs font-medium text-slate-600">Status</span><select v-model="statusFilter" class="w-full rounded-lg border p-2 text-sm"><option value="all">Semua status</option><option value="pending">Belum selesai</option><option value="paid">Dana dilepas</option><option value="returned">Retur</option><option value="lost">Hilang</option></select></label>
<label class="block"><span class="mb-1 block text-xs font-medium text-slate-600">Cari ID, resi, SKU, atau produk</span><input v-model="search" type="search" placeholder="Ketik kata pencarian…" class="w-full rounded-lg border p-2 text-sm"></label></div>
<p v-if="!transactions.length" class="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Belum ada transaksi. Setelah pesanan terkirim cocok dan diimpor, catatannya akan muncul di halaman ini.</p><div v-else-if="!filtered.length" class="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Tidak ada transaksi yang sesuai dengan filter.</div>
<div v-else class="mt-5 overflow-x-auto rounded-xl border"><table class="w-full min-w-[980px] text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">Tanggal</th><th class="p-3">Toko</th><th class="p-3">ID Pesanan</th><th class="p-3">ID Paket / Resi</th><th class="p-3">Isi paket</th><th class="p-3">Total HPP</th><th class="p-3">Status</th><th class="p-3">Aksi</th></tr></thead><tbody class="divide-y"><tr v-for="tx in filtered" :key="tx.id" class="align-top"><td class="p-3 whitespace-nowrap">{{ formatDate(tx.tanggalTerkirim || tx.tanggal || tx.createdAt) }}</td><td class="p-3">{{ tx.channel || channelName(tx.channelId) || '—' }}</td><td class="p-3 font-mono font-semibold">{{ tx.marketplaceOrderId || '—' }}</td><td class="p-3 font-mono text-xs">{{ packageLabel(tx) }}</td><td class="p-3"><div class="space-y-1"><p v-for="(item,index) in tx.items || []" :key="index">{{ item.nama || item.sku || 'Produk' }}<span v-if="item.warna"> · {{ item.warna }}</span><span v-if="item.ukuran || item.varian"> · {{ item.ukuran || item.varian }}</span> ({{ Number(item.qty)||0 }} pcs)</p></div></td><td class="p-3 font-semibold">{{ formatCurrency(hpp(tx)) }}</td><td class="p-3"><span class="rounded-full px-2 py-1 text-xs font-semibold" :class="statusClass(tx)">{{ statusLabel(tx) }}</span></td><td class="p-3"><button type="button" @click="deleteOrder(tx)" :disabled="Boolean(deletingId)" class="whitespace-nowrap rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">{{ deletingId === tx.id ? 'Menghapus…' : 'Hapus pesanan' }}</button></td></tr></tbody></table></div>
<p v-if="deleteError" role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ deleteError }}</p><p v-if="deleteMessage" role="status" class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ deleteMessage }}</p></section></div></div>
</template>
<script setup>
/* global defineProps, defineEmits */
import {computed,ref} from 'vue';
import {auth} from '../firebase.js';
const props=defineProps({transactions:{type:Array,default:()=>[]},marketplaces:{type:Array,default:()=>[]},userId:{type:String,default:''}});
const emit=defineEmits(['deleted']);
const deletingId=ref(''),deleteError=ref(''),deleteMessage=ref(''),deletedIds=ref([]);
const search=ref(''),channelFilter=ref('all'),statusFilter=ref('all'),norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
function dateValue(v){if(v?.toDate)return v.toDate();if(v instanceof Date)return v;if(v?.seconds)return new Date(v.seconds*1000);const d=new Date(v||0);return Number.isNaN(d.getTime())?new Date(0):d}
const transactions=computed(()=>[...props.transactions].sort((a,b)=>dateValue(b.tanggalTerkirim||b.tanggal||b.createdAt)-dateValue(a.tanggalTerkirim||a.tanggal||a.createdAt))),marketplaces=computed(()=>props.marketplaces);
function statusKey(tx){const s=norm(tx.statusPencairan);if(s.includes('retur')||norm(tx.statusDataMarketplace)==='retur')return'returned';if(s.includes('hilang')||norm(tx.statusDataMarketplace)==='hilang')return'lost';if(s==='sudahcair'||tx.konfirmasiSuksesCairManual)return'paid';return'pending'}
function hpp(tx){return Number(tx.totalHpp)||(tx.items||[]).reduce((s,i)=>s+(Number(i.hpp)||0)*(Number(i.qty)||0),0)}
const filtered=computed(()=>{const q=norm(search.value);return transactions.value.filter(tx=>{if(deletedIds.value.includes(tx.id))return false;if(channelFilter.value!=='all'&&String(tx.channelId)!==channelFilter.value)return false;if(statusFilter.value!=='all'&&statusKey(tx)!==statusFilter.value)return false;if(!q)return true;return[tx.marketplaceOrderId,tx.externalPackageId,tx.trackingNumber,tx.channel,...(tx.items||[]).flatMap(i=>[i.nama,i.sku,i.warna,i.ukuran,i.varian])].some(v=>norm(v).includes(q))})});
const totalQty=computed(()=>filtered.value.reduce((s,tx)=>s+(tx.items||[]).reduce((q,i)=>q+(Number(i.qty)||0),0),0)),totalHpp=computed(()=>filtered.value.reduce((s,tx)=>s+hpp(tx),0));
function channelName(id){return props.marketplaces.find(x=>String(x.id)===String(id))?.name||''}
function packageLabel(tx){return[tx.externalPackageId,tx.trackingNumber].filter(Boolean).join(' / ')||'—'}
function statusLabel(tx){if(statusKey(tx)==='paid')return tx.konfirmasiSuksesCairManual?'Dana dilepas · ID dikonfirmasi':'Dana dilepas';if(statusKey(tx)==='returned')return'Retur';if(statusKey(tx)==='lost')return'Hilang';if(norm(tx.statusDataMarketplace)==='cocok')return'Data penghasilan cocok · belum cair';return'Belum selesai'}
function statusClass(tx){return statusKey(tx)==='paid'?'bg-emerald-100 text-emerald-800':statusKey(tx)==='returned'?'bg-amber-100 text-amber-800':statusKey(tx)==='lost'?'bg-red-100 text-red-800':'bg-slate-100 text-slate-700'}
function formatDate(v){const d=dateValue(v);return d.getTime()?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d):'—'}
function formatCurrency(v){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0)}
async function deleteRequest(body) {
    const user=auth.currentUser;
    if(!user || user.uid!==props.userId)throw new Error('Silakan masuk kembali sebelum menghapus pesanan.');
    const token=await user.getIdToken();
    const response=await fetch('/api/confirm-marketplace-dispatch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message || 'Penghapusan belum berhasil. Muat ulang Riwayat Transaksi.');
    return data;
}
function forgetDeletedImport(result) {
    const key=norm(result.orderId); if(!key)return;
    for(const platform of result.platform ? [result.platform] : ['shopee','tiktok']) {
        const storageKey='fashion-os-dispatch-v2:'+props.userId+':'+platform;
        const draft=JSON.parse(localStorage.getItem(storageKey)||'null');
        if(!draft || draft.userId!==props.userId || draft.platform!==platform)continue;
        for(const field of ['confirmed','completedHere','deferred'])draft[field]=(draft[field]||[]).filter(id=>id!==key);
        draft.orders=(draft.orders||[]).filter(order=>order.key!==key);
        localStorage.setItem(storageKey,JSON.stringify(draft));
    }
}
async function deleteOrder(tx) {
    if(deletingId.value)return;
    deletingId.value=tx.id; deleteError.value=''; deleteMessage.value='';
    const uid=props.userId,orderId=tx.marketplaceOrderId||tx.id;
    try {
        if(!window.confirm('Konfirmasi 1 dari 2: Hapus pesanan '+orderId+' dari Riwayat Transaksi? Anda akan diminta konfirmasi sekali lagi.'))return;
        const prepared=await deleteRequest({action:'prepare_delete',transactionId:tx.id});
        if(uid!==props.userId)return;
        if(!window.confirm('Konfirmasi 2 dari 2 — terakhir: Hapus pesanan '+prepared.orderId+'? '+prepared.restoreQty+' pcs stok akan dikembalikan ke Inventaris. Pesanan yang dihapus dapat diimpor ulang. Pilih OK untuk menghapus.'))return;
        const result=await deleteRequest({action:'delete',transactionId:tx.id,fingerprint:prepared.fingerprint,confirmationSteps:2});
        if(uid!==props.userId)return;
        deletedIds.value=[...deletedIds.value,tx.id]; emit('deleted',result);
        deleteMessage.value='Pesanan '+orderId+' berhasil dihapus.'+(result.restoredQty ? ' Stok '+result.restoredQty+' pcs sudah dikembalikan.':'');
        try{forgetDeletedImport(result);}catch(_){deleteError.value='Pesanan sudah dihapus, tetapi ingatan impor pada perangkat belum dapat diperbarui.';}
    }catch(error){deleteError.value=error.message || 'Penghapusan belum berhasil. Muat ulang Riwayat Transaksi sebelum mencoba lagi.';}
    finally{deletingId.value='';}
}
</script>
