<template>
<section class="rounded-lg border bg-slate-50 p-4">
    <label for="return-order-search" class="block text-sm font-medium">1. Scan Resi atau Masukkan ID Pesanan Marketplace</label>
    <div class="mt-1 flex flex-col gap-2 md:flex-row">
        <input id="return-order-search" v-model="query" :disabled="picking" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="find" @keydown.esc="expanded=false" @focus="expanded=true" type="text" autocomplete="off" role="combobox" :aria-expanded="expanded && matches.length > 0" aria-controls="return-order-suggestions" placeholder="Ketik 3 karakter terakhir ID pesanan / resi, atau scan nomor lengkap…" class="w-full flex-1 rounded-md border p-2">
        <button type="button" @click="find" :disabled="picking" class="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50">{{ picking ? 'Mencari…' : 'Cari Transaksi' }}</button>
    </div>
    <p class="mt-2 text-xs text-slate-500">Ketik minimal 3 karakter terakhir lalu pilih rekomendasi. Jika akhir ID sama, pilih ID lengkap dan toko yang benar.</p>
    <p v-if="loading" class="mt-2 text-xs text-slate-500">Memuat daftar pesanan untuk pencarian…</p>
    <ul v-if="expanded && key.length >= 3 && matches.length" id="return-order-suggestions" class="mt-2 max-h-64 overflow-y-auto rounded-lg border bg-white" role="listbox">
        <li v-for="(row,index) in matches.slice(0,30)" :key="row.id" role="option" :aria-selected="highlight===index">
            <button type="button" @click="choose(row)" :disabled="picking" class="w-full border-b p-3 text-left last:border-b-0 hover:bg-indigo-50 disabled:opacity-50" :class="highlight===index ? 'bg-indigo-50' : ''">
                <p class="break-all font-mono text-sm font-semibold">{{ label(row).slice(0,-3) }}<mark class="rounded bg-amber-100 px-0.5">{{ label(row).slice(-3) }}</mark></p>
                <p class="mt-1 text-xs text-slate-600">{{ row.channel || 'Marketplace' }} · {{ dateLabel(row.tanggalTerkirim || row.tanggal) }}</p>
                <p v-if="row.trackingNumber || row.externalPackageId" class="mt-1 break-all text-xs text-slate-500">{{ row.trackingNumber || row.externalPackageId }}</p>
            </button>
        </li>
    </ul>
    <p v-if="matches.length>30 && expanded" class="mt-2 text-xs text-amber-800">Ada {{ matches.length }} hasil. Ketik akhiran ID lebih panjang untuk mempersempit pencarian.</p>
    <p v-if="!loading && expanded && key.length>=3 && !matches.length" class="mt-2 text-xs text-slate-500">Tidak ada pesanan dengan akhiran tersebut.</p>
    <p v-if="message" role="status" class="mt-2 text-sm text-indigo-700">{{ message }}</p>
    <p v-if="error" role="alert" class="mt-2 text-sm text-red-700">{{ error }} <button v-if="!loading" type="button" @click="loadIndex" class="font-semibold underline">Muat ulang pencarian</button></p>
</section>
</template>
<script setup>
/* global defineProps, defineEmits */
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {auth} from '../firebase.js';
import {returnSearchKey,searchReturnOrders,uniqueReturnOrder} from '../return-search.js';
const props=defineProps({userId:{type:String,default:''},transactions:{type:Array,default:()=>[]}});
const emit=defineEmits(['selected','clear']);
const query=ref(''),rows=ref([]),loading=ref(false),picking=ref(false),error=ref(''),message=ref(''),expanded=ref(true),highlight=ref(-1);
const key=computed(()=>returnSearchKey(query.value));
const matches=computed(()=>searchReturnOrders(rows.value,query.value));
const label=row=>String(row.marketplaceOrderId||row.id);
let active=true,version=0;const controllers=new Set();
function dateLabel(value){const d=value?.toDate?value.toDate():new Date(value||0);return Number.isFinite(d.getTime())&&d.getTime()?d.toLocaleDateString('id-ID'):'—';}
watch(query,()=>{expanded.value=true;highlight.value=-1;error.value='';message.value='';emit('clear');},{flush:'sync'});
async function request(body){
 const user=auth.currentUser;if(!user || user.uid!==props.userId)throw new Error('Silakan masuk kembali untuk mencari transaksi.');
 const token=await user.getIdToken(),controller=new AbortController();controllers.add(controller);const timer=window.setTimeout(()=>controller.abort(),45000);
 try{const response=await fetch('/api/confirm-marketplace-dispatch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||'Pencarian transaksi belum berhasil.');return result;}
 catch(issue){if(issue.name==='AbortError')throw new Error('Pencarian melewati batas waktu. Coba muat ulang pencarian.');throw issue;}
 finally{window.clearTimeout(timer);controllers.delete(controller);}
}
async function loadIndex(){
 const uid=props.userId,revision=++version;rows.value=(props.transactions||[]).filter(row=>!row.userId||row.userId===uid);error.value='';if(!uid)return;
 loading.value=true;
 try{let afterId=null;do{const data=await request({action:'return_index',afterId});if(!active||props.userId!==uid||revision!==version)return;const merged=new Map(rows.value.map(row=>[row.id,row]));data.transactions.forEach(row=>merged.set(row.id,row));rows.value=[...merged.values()];afterId=data.nextCursor||null;}while(afterId);}
 catch(issue){if(active&&props.userId===uid&&revision===version)error.value=issue.message;}
 finally{if(revision===version)loading.value=false;}
}
function move(delta){const length=Math.min(matches.value.length,30);if(length)highlight.value=(highlight.value+delta+length)%length;expanded.value=true;}
async function choose(row){
 if(picking.value)return;const uid=props.userId;picking.value=true;query.value=label(row);const selectedQuery=query.value;error.value='';
 try{const data=await request({action:'return_transaction',transactionId:row.id});if(!active||uid!==props.userId||query.value!==selectedQuery)return;emit('selected',data.transaction);expanded.value=false;message.value='Pesanan '+label(data.transaction)+' dipilih untuk retur.';}
 catch(issue){if(active&&uid===props.userId)error.value=issue.message;}
 finally{picking.value=false;}
}
function find(){
 if(picking.value)return;error.value='';message.value='';expanded.value=true;
 if(key.value.length<3){message.value='Ketik minimal 3 karakter terakhir ID pesanan atau resi.';return;}
 const selected=highlight.value>=0?matches.value[highlight.value]:uniqueReturnOrder(rows.value,query.value);
 if(selected)return choose(selected);
 message.value=matches.value.length?'Ada beberapa pesanan dengan akhiran yang sama. Pilih rekomendasi yang benar.':loading.value?'Daftar pesanan masih dimuat. Tunggu sebentar lalu cari kembali.':'Pesanan tidak ditemukan. Periksa ID atau resinya.';
}
onMounted(loadIndex);
watch(()=>props.userId,()=>{query.value='';emit('clear');loadIndex();});
onBeforeUnmount(()=>{active=false;version++;controllers.forEach(controller=>controller.abort());});
</script>
