<template>
<section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div class="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:p-6"><p class="text-xs font-bold uppercase tracking-wide text-indigo-600">Pencatatan retur</p><h2 class="mt-1 text-xl font-bold text-slate-900">Terima barang kembali</h2><p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Cari pesanan, periksa isi paket, lalu simpan retur. Seluruh isi pesanan akan dibatalkan dari perhitungan penjualan dan dikembalikan ke stok. Catat setelah barang retur diterima di gudang.</p></div>
    <div class="space-y-5 p-5 sm:p-6">
        <ReturnOrderSearch :key="searchKey" :user-id="userId" :transactions="transactions" @selected="selectTransaction" @clear="clearSelection" />
        <div v-if="selected" class="space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><div><p class="text-xs font-semibold text-slate-500">ID pesanan</p><p class="mt-1 break-all font-mono font-bold text-slate-900">{{ selected.marketplaceOrderId || selected.id }}</p><p class="mt-1 text-sm text-slate-600">{{ selected.channel || 'Marketplace' }}</p></div><span class="rounded-full px-3 py-1 text-xs font-bold" :class="selected.returnCompleted ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-900'">{{ selected.returnCompleted ? 'Retur sudah tercatat' : isReturnedOrder(selected) ? 'Retur belum diselesaikan di gudang' : totalQty + ' pcs akan kembali' }}</span></div>
            <div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full min-w-[520px] text-left text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-3">Produk / SKU</th><th class="p-3">Warna / ukuran</th><th class="p-3 text-right">Qty pesanan</th></tr></thead><tbody class="divide-y divide-slate-100"><tr v-for="(item,index) in selected.items || []" :key="index"><td class="p-3"><p class="font-semibold text-slate-800">{{ item.nama || item.sku }}</p><p class="mt-1 font-mono text-xs text-slate-500">{{ item.sku }}</p></td><td class="p-3 text-slate-600">{{ item.warna || '—' }} · {{ item.ukuran || item.varian || '—' }}</td><td class="p-3 text-right font-bold">{{ item.qty }} pcs</td></tr></tbody></table></div>
            <div class="grid gap-4 sm:grid-cols-[200px_1fr]"><label class="text-sm font-semibold text-slate-700">Tanggal diterima<input type="date" v-model="returnDate" :disabled="saving" class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"></label><label class="text-sm font-semibold text-slate-700">Alasan / catatan <span class="font-normal text-slate-400">(opsional)</span><input v-model="reason" :disabled="saving" placeholder="Contoh: ukuran tidak sesuai atau pesanan dibatalkan" maxlength="1000" class="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"></label></div>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p class="max-w-xl text-xs leading-5 text-slate-500">Stok dikembalikan satu kali. Pesanan retur keluar dari daftar konfirmasi keberhasilan serta perhitungan pesanan aktif dan HPP penjualan pada Dashboard.</p><button type="button" @click="save" :disabled="!canSave" class="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">{{ saving ? 'Menyimpan retur…' : 'Catat retur & kembalikan stok' }}</button></div>
            <p v-if="selected.returnCompleted" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pesanan ini sudah ditangani. Stok tidak akan ditambahkan lagi.</p>
        </div>
        <div v-else class="rounded-xl border border-dashed border-slate-200 p-6 text-center"><p class="font-semibold text-slate-700">Pilih pesanan untuk mencatat retur</p><p class="mt-1 text-sm text-slate-500">Rincian barang akan tampil di sini setelah pesanan dipilih.</p></div>
        <p v-if="error" role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p><p v-if="message" role="status" class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{{ message }}</p>
    </div>
</section>
</template>
<script setup>
/* global defineProps, defineEmits */
import {computed,ref} from 'vue';
import {auth} from '../firebase.js';
import {isReturnedOrder} from '../order-return.js';
import ReturnOrderSearch from './ReturnOrderSearch.vue';
const props=defineProps({userId:{type:String,default:''},transactions:{type:Array,default:()=>[]},subscriptionActive:{type:Boolean,default:true}});
const emit=defineEmits(['completed']);
const selected=ref(null),saving=ref(false),reason=ref(''),error=ref(''),message=ref(''),searchKey=ref(0);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const returnDate=ref(today());
const totalQty=computed(()=>(selected.value?.items||[]).reduce((sum,item)=>sum+(Number(item.qty)||0),0));
const canSave=computed(()=>!saving.value&&props.subscriptionActive&&props.userId&&selected.value&&totalQty.value>0&&returnDate.value&&selected.value.returnCompleted!==true);
function clearSelection(){if(!saving.value){selected.value=null;error.value='';}}
function selectTransaction(tx){if(!saving.value){selected.value=tx;reason.value='';error.value='';message.value='';returnDate.value=today();}}
function asDate(value){if(value?.toDate)return value.toDate();const seconds=value?.seconds??value?._seconds;return seconds!=null?new Date(seconds*1000):value?new Date(value):null;}
async function save(){
 if(!canSave.value)return;const tx=selected.value,uid=props.userId;saving.value=true;error.value='';message.value='';const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),60000);
 try{
  const user=auth.currentUser;if(!user||user.uid!==uid)throw new Error('Silakan masuk kembali sebelum mencatat retur.');const token=await user.getIdToken();
  const response=await fetch('/api/confirm-marketplace-dispatch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'record_return',transactionId:tx.id,returnDate:returnDate.value,reason:reason.value}),signal:controller.signal,cache:'no-store'});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'Retur belum berhasil disimpan.');if(uid!==props.userId)return;
  for(const key of ['tanggal','tanggalTerkirim','tanggalPencairan','tanggalRetur','returnCompletedAt'])if(data.transaction[key])data.transaction[key]=asDate(data.transaction[key]);
  if(data.returnRecord)for(const key of ['tanggal','createdAt'])if(data.returnRecord[key])data.returnRecord[key]=asDate(data.returnRecord[key]);
  emit('completed',data);selected.value=data.transaction;
  message.value=data.alreadyReturned?'Pesanan ini sudah tercatat retur. Stok tidak ditambahkan lagi.':'Retur '+(tx.marketplaceOrderId||tx.id)+' tersimpan. '+(data.restoredQty||0)+' pcs stok dikembalikan; daftar konfirmasi dan Dashboard diperbarui.';
 }catch(issue){error.value=issue.name==='AbortError'?'Koneksi melewati batas waktu. Cari ulang pesanan sebelum mencoba lagi; stok retur tidak akan ditambahkan dua kali.':issue.message;}
 finally{window.clearTimeout(timer);saving.value=false;}
}
</script>
