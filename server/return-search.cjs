const { FieldPath } = require('firebase-admin/firestore');
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
const validId=id=>typeof id==='string'&&/^[a-z0-9_-]{1,150}$/i.test(id);
const date=v=>v?.toDate?v.toDate().toISOString():v instanceof Date?v.toISOString():v||null;
async function returnSearchIndex({db,userId,input}){
 if(!userId)fail(401,'Silakan masuk kembali.');
 if(input.afterId!=null&&!validId(input.afterId))fail(400,'Halaman pencarian tidak valid.');
 let query=db.collection('transactions').where('userId','==',userId).orderBy(FieldPath.documentId()).select('marketplaceOrderId','trackingNumber','trackingNumbers','externalPackageId','externalPackageIds','channel','channelId','tanggal','tanggalTerkirim');
 if(input.afterId)query=query.startAfter(input.afterId);
 const snap=await query.limit(501).get();const selected=snap.docs.slice(0,500);
 return {transactions:selected.map(doc=>{const row=doc.data();return{id:doc.id,marketplaceOrderId:row.marketplaceOrderId||'',trackingNumber:row.trackingNumber||'',trackingNumbers:row.trackingNumbers||[],externalPackageId:row.externalPackageId||'',externalPackageIds:row.externalPackageIds||[],channel:row.channel||'',channelId:row.channelId||'',tanggal:date(row.tanggalTerkirim||row.tanggal)};}),nextCursor:snap.docs.length>500?selected.at(-1).id:null};
}
async function returnSearchTransaction({db,userId,input}){
 if(!userId)fail(401,'Silakan masuk kembali.');
 if(!validId(input.transactionId))fail(400,'ID transaksi tidak valid.');
 const doc=await db.collection('transactions').doc(input.transactionId).get();
 if(!doc.exists)fail(404,'Pesanan sudah dihapus atau tidak ditemukan. Muat ulang daftar pencarian.');
 const row=doc.data();if(row.userId!==userId)fail(403,'Transaksi bukan milik akun ini.');
 return {transaction:{...row,id:doc.id,tanggal:date(row.tanggal),tanggalTerkirim:date(row.tanggalTerkirim)}};
}
module.exports={returnSearchIndex,returnSearchTransaction};
