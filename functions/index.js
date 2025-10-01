const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Cloud Function v2 ini terpicu setiap ada TRANSAKSI BARU.
 */
exports.updateSummaryOnNewTransaction = onDocumentCreated("transactions/{transactionId}", async (event) => {
  const transactionData = event.data.data();
  const {userId, tanggal, subtotal, total, items, biaya, diskon} = transactionData;

  if (!userId) {
    console.log("Transaksi tanpa userId, diabaikan.");
    return null;
  }

  const omsetKotor = subtotal || 0;
  const totalDiskon = diskon?.totalDiscount || 0;
  const omsetBersih = total || 0;
  const totalHPP = (items || []).reduce((sum, item) => sum + (item.hpp || 0) * item.qty, 0);
  const biayaTransaksi = biaya?.total || 0;
  const labaKotor = omsetBersih - totalHPP;
  const labaBersihOperasional = labaKotor - biayaTransaksi;

  const date = tanggal.toDate();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");

  const summaryRef = db.doc(`user_summaries/${userId}`);
  const yearPath = `summary_${year}`;
  const monthPath = `${yearPath}.months.${month}`;

  return db.runTransaction(async (transaction) => {
    const updateData = {
      [`${monthPath}.omsetKotor`]: admin.firestore.FieldValue.increment(omsetKotor),
      [`${monthPath}.totalDiskon`]: admin.firestore.FieldValue.increment(totalDiskon),
      [`${monthPath}.hppTerjual`]: admin.firestore.FieldValue.increment(totalHPP),
      [`${monthPath}.biayaTransaksi`]: admin.firestore.FieldValue.increment(biayaTransaksi),
      [`${monthPath}.labaKotor`]: admin.firestore.FieldValue.increment(labaKotor),
      [`${monthPath}.omsetBersih`]: admin.firestore.FieldValue.increment(omsetBersih),
      [`${monthPath}.labaBersihOperasional`]: admin.firestore.FieldValue.increment(labaBersihOperasional),
      [`${monthPath}.biayaOperasional`]: admin.firestore.FieldValue.increment(0),
      [`${monthPath}.nilaiRetur`]: admin.firestore.FieldValue.increment(0),
      
      [`${yearPath}.yearlyTotals.omsetKotor`]: admin.firestore.FieldValue.increment(omsetKotor),
      [`${yearPath}.yearlyTotals.totalDiskon`]: admin.firestore.FieldValue.increment(totalDiskon),
      [`${yearPath}.yearlyTotals.hppTerjual`]: admin.firestore.FieldValue.increment(totalHPP),
      [`${yearPath}.yearlyTotals.biayaTransaksi`]: admin.firestore.FieldValue.increment(biayaTransaksi),
      [`${yearPath}.yearlyTotals.labaKotor`]: admin.firestore.FieldValue.increment(labaKotor),
      [`${yearPath}.yearlyTotals.omsetBersih`]: admin.firestore.FieldValue.increment(omsetBersih),
      [`${yearPath}.yearlyTotals.labaBersihOperasional`]: admin.firestore.FieldValue.increment(labaBersihOperasional),
      [`${yearPath}.yearlyTotals.biayaOperasional`]: admin.firestore.FieldValue.increment(0),
      [`${yearPath}.yearlyTotals.nilaiRetur`]: admin.firestore.FieldValue.increment(0),
    };
    transaction.set(summaryRef, updateData, {merge: true});
  });
});

/**
 * Cloud Function v2 ini terpicu setiap ada DOKUMEN BARU di 'keuangan'.
 */
exports.updateSummaryOnNewExpense = onDocumentCreated("keuangan/{financeId}", async (event) => {
  const financeData = event.data.data();
  const {userId, tanggal, jenis, jumlah} = financeData;

  if (jenis !== "pengeluaran" || !userId) {
    return null;
  }

  const biayaOperasional = jumlah || 0;
  const date = tanggal.toDate();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");

  const summaryRef = db.doc(`user_summaries/${userId}`);
  const yearPath = `summary_${year}`;
  const monthPath = `${yearPath}.months.${month}`;

  return db.runTransaction(async (transaction) => {
    const updateData = {
      [`${monthPath}.biayaOperasional`]: admin.firestore.FieldValue.increment(biayaOperasional),
      [`${yearPath}.yearlyTotals.biayaOperasional`]: admin.firestore.FieldValue.increment(biayaOperasional),
      [`${monthPath}.labaBersihOperasional`]: admin.firestore.FieldValue.increment(-biayaOperasional),
      [`${yearPath}.yearlyTotals.labaBersihOperasional`]: admin.firestore.FieldValue.increment(-biayaOperasional),
    };
    transaction.set(summaryRef, updateData, {merge: true});
  });
});

/**
 * Cloud Function v2 ini terpicu setiap ada DOKUMEN BARU di 'returns'.
 */
exports.updateSummaryOnNewReturn = onDocumentCreated("returns/{returnId}", async (event) => {
  const returnData = event.data.data();
  const {userId, tanggal, items} = returnData;

  if (!userId || !items || items.length === 0) {
    return null;
  }

  let totalNilaiRetur = 0;
  let totalBiayaMarketplaceBatal = 0;
  let totalHppRetur = 0;

  for (const item of items) {
    totalNilaiRetur += item.nilaiRetur || 0;
    totalBiayaMarketplaceBatal += item.biayaMarketplace || 0;
    const productQuery = await db.collection("products").where("sku", "==", item.sku).limit(1).get();
    if (!productQuery.empty) {
      const productData = productQuery.docs[0].data();
      totalHppRetur += (productData.hpp || 0) * (item.qty || 0);
    }
  }

  const date = tanggal.toDate();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");

  const summaryRef = db.doc(`user_summaries/${userId}`);
  const yearPath = `summary_${year}`;
  const monthPath = `${yearPath}.months.${month}`;
  
  const labaKotorChange = totalHppRetur - totalNilaiRetur;
  const labaBersihChange = labaKotorChange + totalBiayaMarketplaceBatal;

  return db.runTransaction(async (transaction) => {
    const updateData = {
      [`${monthPath}.nilaiRetur`]: admin.firestore.FieldValue.increment(totalNilaiRetur),
      [`${monthPath}.omsetBersih`]: admin.firestore.FieldValue.increment(-totalNilaiRetur),
      [`${monthPath}.hppTerjual`]: admin.firestore.FieldValue.increment(-totalHppRetur),
      [`${monthPath}.biayaTransaksi`]: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
      [`${monthPath}.labaKotor`]: admin.firestore.FieldValue.increment(labaKotorChange),
      [`${monthPath}.labaBersihOperasional`]: admin.firestore.FieldValue.increment(labaBersihChange),
      
      [`${yearPath}.yearlyTotals.nilaiRetur`]: admin.firestore.FieldValue.increment(totalNilaiRetur),
      [`${yearPath}.yearlyTotals.omsetBersih`]: admin.firestore.FieldValue.increment(-totalNilaiRetur),
      [`${yearPath}.yearlyTotals.hppTerjual`]: admin.firestore.FieldValue.increment(-totalHppRetur),
      [`${yearPath}.yearlyTotals.biayaTransaksi`]: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
      [`${yearPath}.yearlyTotals.labaKotor`]: admin.firestore.FieldValue.increment(labaKotorChange),
      [`${yearPath}.yearlyTotals.labaBersihOperasional`]: admin.firestore.FieldValue.increment(labaBersihChange),
    };
    transaction.set(summaryRef, updateData, {merge: true});
  });
});