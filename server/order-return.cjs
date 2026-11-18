const {createHash}=require('node:crypto');
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
const validId=id=>typeof id==='string'&&/^[a-z0-9_-]{1,150}$/i.test(id);
async function recordOrderReturn({db,userId,input,now=new Date()}){
 if(!userId||!validId(input?.transactionId))fail(400,'ID transaksi tidak valid.');
 const day=String(input.returnDate||''),date=/^\d{4}-\d{2}-\d{2}$/.test(day)?new Date(day+'T12:00:00+07:00'):null;
 if(!date||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==day)fail(400,'Tanggal retur tidak valid.');
 const reason=String(input.reason||'Retur pesanan diterima').trim().slice(0,1000)||'Retur pesanan diterima';
 const returnId='ORDER-RETURN-'+createHash('sha256').update(JSON.stringify([userId,input.transactionId])).digest('hex');
 return db.runTransaction(async transaction=>{
  const txRef=db.collection('transactions').doc(input.transactionId),snap=await transaction.get(txRef);
  if(!snap.exists||snap.data().userId!==userId)fail(403,'Transaksi tidak ditemukan pada akun ini.');
  const tx=snap.data(),returnRef=db.collection('returns').doc(returnId),known=await transaction.get(returnRef);
  if(known.exists||tx.returnCompleted===true)return {transaction:{...tx,id:snap.id},returnRecord:known.exists?{...known.data(),id:known.id}:null,stockAfter:{},alreadyReturned:true};
  if(tx.stockDeductionApplied!==true)fail(409,'Pengurangan stok pesanan ini belum dapat dipastikan. Periksa transaksi sebelum mengembalikan stok.');
  if(!Array.isArray(tx.items)||!tx.items.length)fail(409,'Rincian produk pesanan tidak lengkap.');
  const old=await transaction.get(db.collection('returns').where('userId','==',userId).where('originalTransactionId','==',snap.id));
  const returned=new Map();old.docs.forEach(doc=>(doc.data().items||[]).forEach(item=>{const sku=String(item.sku||'');const qty=Number(item.qty);if(!Number.isSafeInteger(qty)||qty<0)fail(409,'Riwayat jumlah retur belum valid.');returned.set(sku,(returned.get(sku)||0)+qty);}));
  const groups=new Map();
  for(const item of tx.items){const sku=String(item.sku||'');const qty=Number(item.qty);if(!sku||!Number.isSafeInteger(qty)||qty<=0)fail(409,'SKU atau jumlah barang pesanan tidak valid.');if(groups.has(sku)){if(groups.get(sku).docId&&item.docId&&groups.get(sku).docId!==item.docId)fail(409,'Satu SKU terhubung ke beberapa produk. Periksa Inventaris.');groups.get(sku).qty+=qty;}else groups.set(sku,{...item,sku,qty});}
  for(const [sku,qty]of returned)if(!groups.has(sku)&&qty)fail(409,'Riwayat retur tidak sesuai dengan barang pada pesanan.');
  const needs=new Map(),items=[];
  for(const [sku,item]of groups){const remainder=item.qty-(returned.get(sku)||0);if(remainder<0)fail(409,'Jumlah retur lama melebihi jumlah pesanan.');if(!remainder)continue;
   let productId=item.docId||item.productId;if(!productId){const matches=await transaction.get(db.collection('products').where('userId','==',userId).where('sku','==',sku));if(matches.docs.length!==1)fail(409,'Produk '+sku+' belum dapat dipastikan di Inventaris.');productId=matches.docs[0].id;}
   if(!validId(productId))fail(409,'Referensi produk tidak valid.');
   needs.set(productId,(needs.get(productId)||0)+remainder);
   items.push({...item,docId:productId,qty:remainder,hpp:Number(item.hpp)||0,nilaiRetur:0,nilaiDiskon:0,biayaMarketplace:0,alasan:reason,tindakLanjut:'Kembali ke stok'});
  }
  const products=new Map();for(const [id,qty]of needs){const p=await transaction.get(db.collection('products').doc(id));if(!p.exists||p.data().userId!==userId)fail(409,'Produk retur tidak ditemukan di Inventaris akun ini.');const stock=Number(p.data().physical_stock??p.data().stokFisik);if(!Number.isSafeInteger(stock)||!Number.isSafeInteger(stock+qty))fail(409,'Stok Inventaris belum valid.');products.set(id,{ref:p.ref,data:p.data(),after:stock+qty});}
  const previous=tx.statusPencairanSebelumRetur||tx.statusPencairan||'Belum Cair';
  const update={statusPencairan:'Retur/Pengembalian',statusDataMarketplace:'retur',orderOutcome:'returned',returnCompleted:true,returDikonfirmasiManual:true,konfirmasiSuksesCairManual:false,statusPencairanSebelumRetur:previous,tanggalRetur:date,returnCompletedAt:now};
  const record={userId,tanggal:date,createdAt:now,originalTransactionId:snap.id,marketplaceOrderId:tx.marketplaceOrderId||'',channelId:tx.channelId||'',channel:tx.channel||'',sumber:'Penanganan Pesanan',statusRetur:'Retur / Pengembalian',statusPencairanSebelumRetur:previous,items,fullOrderReturn:true,stockRestored:true};
  const stockAfter={};for(const [id,p]of products){transaction.update(p.ref,{physical_stock:p.after,...(Object.hasOwn(p.data,'stokFisik')?{stokFisik:p.after}:{})});stockAfter[id]=p.after;}
  transaction.update(txRef,update);if(items.length)transaction.set(returnRef,record);
  return {transaction:{...tx,...update,id:snap.id},returnRecord:items.length?{...record,id:returnId}:old.docs[0]?{...old.docs[0].data(),id:old.docs[0].id}:null,stockAfter,restoredQty:items.reduce((sum,item)=>sum+item.qty,0),alreadyReturned:false};
 });
}
module.exports={recordOrderReturn};
