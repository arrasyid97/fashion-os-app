const {onDocumentCreated, onDocumentUpdated, onDocumentDeleted} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// --- FUNGSI UNTUK RINGKASAN TRANSAKSI, KEUANGAN, & RETUR ---

exports.updateSummaryOnNewTransaction = onDocumentCreated("transactions/{transactionId}", async (event) => {
    const transactionData = event.data.data();
    const { userId, tanggal, subtotal, total, items, biaya, diskon } = transactionData;
    if (!userId) return null;

    const omsetKotor = subtotal || 0;
    const totalDiskon = diskon?.totalDiscount || 0;
    const omsetBersih = total || 0;
    const totalHPP = (items || []).reduce((sum, item) => sum + (item.hpp || 0) * item.qty, 0);
    const biayaTransaksi = biaya?.total || 0;
    const labaKotor = omsetBersih - totalHPP;
    const labaBersihOperasional = labaKotor - biayaTransaksi;
    const totalQty = (items || []).reduce((sum, item) => sum + (item.qty || 0), 0); // <-- Menghitung QTY

    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const summaryRef = db.doc(`user_summaries/${userId}`);

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    omsetKotor: admin.firestore.FieldValue.increment(omsetKotor),
                    totalDiskon: admin.firestore.FieldValue.increment(totalDiskon),
                    hppTerjual: admin.firestore.FieldValue.increment(totalHPP),
                    biayaTransaksi: admin.firestore.FieldValue.increment(biayaTransaksi),
                    labaKotor: admin.firestore.FieldValue.increment(labaKotor),
                    omsetBersih: admin.firestore.FieldValue.increment(omsetBersih),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihOperasional),
                    totalQty: admin.firestore.FieldValue.increment(totalQty), // <-- Menyimpan QTY
                }
            },
            yearlyTotals: {
                omsetKotor: admin.firestore.FieldValue.increment(omsetKotor),
                totalDiskon: admin.firestore.FieldValue.increment(totalDiskon),
                hppTerjual: admin.firestore.FieldValue.increment(totalHPP),
                biayaTransaksi: admin.firestore.FieldValue.increment(biayaTransaksi),
                labaKotor: admin.firestore.FieldValue.increment(labaKotor),
                omsetBersih: admin.firestore.FieldValue.increment(omsetBersih),
                labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihOperasional),
                totalQty: admin.firestore.FieldValue.increment(totalQty), // <-- Menyimpan QTY
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnNewExpense = onDocumentCreated("keuangan/{financeId}", async (event) => {
    const financeData = event.data.data();
    const { userId, tanggal, jenis, jumlah } = financeData;
    if (jenis !== "pengeluaran" || !userId) return null;

    const biayaOperasional = jumlah || 0;
    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");

    const summaryRef = db.doc(`user_summaries/${userId}`);

    // --- STRUKTUR OBJEK BARU YANG BENAR ---
    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    biayaOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
                }
            },
            yearlyTotals: {
                biayaOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
                labaBersihOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnNewReturn = onDocumentCreated("returns/{returnId}", async (event) => {
    const returnData = event.data.data();
    const { userId, tanggal, items } = returnData;
    if (!userId || !items || items.length === 0) return null;

    let totalNilaiRetur = 0;
    let totalBiayaMarketplaceBatal = 0;
    let totalHppRetur = 0;
    let totalQtyRetur = 0; // <-- Menghitung QTY Retur

    for (const item of items) {
        totalNilaiRetur += item.nilaiRetur || 0;
        totalBiayaMarketplaceBatal += item.biayaMarketplace || 0;
        totalQtyRetur += item.qty || 0; // <-- Menghitung QTY Retur
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
    const labaKotorChange = totalHppRetur - totalNilaiRetur;
    const labaBersihChange = labaKotorChange + totalBiayaMarketplaceBatal;

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    nilaiRetur: admin.firestore.FieldValue.increment(totalNilaiRetur),
                    omsetBersih: admin.firestore.FieldValue.increment(-totalNilaiRetur),
                    hppTerjual: admin.firestore.FieldValue.increment(-totalHppRetur),
                    biayaTransaksi: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
                    labaKotor: admin.firestore.FieldValue.increment(labaKotorChange),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihChange),
                    totalQty: admin.firestore.FieldValue.increment(-totalQtyRetur), // <-- Mengurangi QTY
                }
            },
            yearlyTotals: {
                nilaiRetur: admin.firestore.FieldValue.increment(totalNilaiRetur),
                omsetBersih: admin.firestore.FieldValue.increment(-totalNilaiRetur),
                hppTerjual: admin.firestore.FieldValue.increment(-totalHppRetur),
                biayaTransaksi: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
                labaKotor: admin.firestore.FieldValue.increment(labaKotorChange),
                labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihChange),
                totalQty: admin.firestore.FieldValue.increment(-totalQtyRetur), // <-- Mengurangi QTY
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});
// --- FUNGSI BARU UNTUK INVENTARIS DENGAN SINTAKS v2 ---

exports.onProductCreate = onDocumentCreated("products/{productId}", async (event) => {
  const productData = event.data.data();
  const {userId, physical_stock, hpp} = productData;
  if (!userId) return null;

  const stockChange = physical_stock || 0;
  const hppValueChange = (hpp || 0) * stockChange;
  const summaryRef = db.doc(`user_summaries/${userId}`);

  return summaryRef.set({
    inventoryTotals: {
      totalUnitStok: admin.firestore.FieldValue.increment(stockChange),
      totalNilaiStokHPP: admin.firestore.FieldValue.increment(hppValueChange),
    },
  }, {merge: true});
});

exports.onProductDelete = onDocumentDeleted("products/{productId}", async (event) => {
  const productData = event.data.data();
  const {userId, physical_stock, hpp} = productData;
  if (!userId) return null;

  const stockChange = physical_stock || 0;
  const hppValueChange = (hpp || 0) * stockChange;
  const summaryRef = db.doc(`user_summaries/${userId}`);

  return summaryRef.set({
    inventoryTotals: {
      totalUnitStok: admin.firestore.FieldValue.increment(-stockChange),
      totalNilaiStokHPP: admin.firestore.FieldValue.increment(-hppValueChange),
    },
  }, {merge: true});
});

exports.onProductUpdate = onDocumentUpdated("products/{productId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  
  if (beforeData.physical_stock === afterData.physical_stock) {
    return null;
  }

  const userId = afterData.userId;
  if (!userId) return null;

  const stockChange = afterData.physical_stock - beforeData.physical_stock;
  const hppValueChange = (afterData.hpp * afterData.physical_stock) - (beforeData.hpp * beforeData.physical_stock);
  
  const summaryRef = db.doc(`user_summaries/${userId}`);
  
  return summaryRef.set({
    inventoryTotals: {
      totalUnitStok: admin.firestore.FieldValue.increment(stockChange),
      totalNilaiStokHPP: admin.firestore.FieldValue.increment(hppValueChange),
    },
  }, {merge: true});
});

exports.updateSummaryOnDeleteTransaction = onDocumentDeleted("transactions/{transactionId}", async (event) => {
    const deletedData = event.data.data();
    const { userId, tanggal, subtotal, total, items, biaya, diskon } = deletedData;
    if (!userId) return null;

    const omsetKotor = subtotal || 0;
    const totalDiskon = diskon?.totalDiscount || 0;
    const omsetBersih = total || 0;
    const totalHPP = (items || []).reduce((sum, item) => sum + (item.hpp || 0) * item.qty, 0);
    const biayaTransaksi = biaya?.total || 0;
    const labaKotor = omsetBersih - totalHPP;
    const labaBersihOperasional = labaKotor - biayaTransaksi;
    const totalQty = (items || []).reduce((sum, item) => sum + (item.qty || 0), 0);

    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const summaryRef = db.doc(`user_summaries/${userId}`);

    // Mengurangi nilai (decrement) karena data dihapus
    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    omsetKotor: admin.firestore.FieldValue.increment(-omsetKotor),
                    totalDiskon: admin.firestore.FieldValue.increment(-totalDiskon),
                    hppTerjual: admin.firestore.FieldValue.increment(-totalHPP),
                    biayaTransaksi: admin.firestore.FieldValue.increment(-biayaTransaksi),
                    labaKotor: admin.firestore.FieldValue.increment(-labaKotor),
                    omsetBersih: admin.firestore.FieldValue.increment(-omsetBersih),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(-labaBersihOperasional),
                    totalQty: admin.firestore.FieldValue.increment(-totalQty),
                }
            },
            yearlyTotals: {
                omsetKotor: admin.firestore.FieldValue.increment(-omsetKotor),
                totalDiskon: admin.firestore.FieldValue.increment(-totalDiskon),
                hppTerjual: admin.firestore.FieldValue.increment(-totalHPP),
                biayaTransaksi: admin.firestore.FieldValue.increment(-biayaTransaksi),
                labaKotor: admin.firestore.FieldValue.increment(-labaKotor),
                omsetBersih: admin.firestore.FieldValue.increment(-omsetBersih),
                labaBersihOperasional: admin.firestore.FieldValue.increment(-labaBersihOperasional),
                totalQty: admin.firestore.FieldValue.increment(-totalQty),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnDeleteExpense = onDocumentDeleted("keuangan/{financeId}", async (event) => {
    const deletedData = event.data.data();
    const { userId, tanggal, jenis, jumlah } = deletedData;
    if (jenis !== "pengeluaran" || !userId) return null;

    const biayaOperasional = jumlah || 0;
    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const summaryRef = db.doc(`user_summaries/${userId}`);

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    biayaOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(biayaOperasional), // Ditambah karena pengeluaran berkurang
                }
            },
            yearlyTotals: {
                biayaOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
                labaBersihOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnDeleteReturn = onDocumentDeleted("returns/{returnId}", async (event) => {
    const deletedData = event.data.data();
    const { userId, tanggal, items } = deletedData;
    if (!userId || !items || items.length === 0) return null;

    let totalNilaiRetur = 0;
    let totalBiayaMarketplaceBatal = 0;
    let totalHppRetur = 0;
    let totalQtyRetur = 0;

    for (const item of items) {
        totalNilaiRetur += item.nilaiRetur || 0;
        totalBiayaMarketplaceBatal += item.biayaMarketplace || 0;
        totalQtyRetur += item.qty || 0;
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
    const labaKotorChange = totalHppRetur - totalNilaiRetur;
    const labaBersihChange = labaKotorChange + totalBiayaMarketplaceBatal;

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    nilaiRetur: admin.firestore.FieldValue.increment(-totalNilaiRetur),
                    omsetBersih: admin.firestore.FieldValue.increment(totalNilaiRetur),
                    hppTerjual: admin.firestore.FieldValue.increment(totalHppRetur),
                    biayaTransaksi: admin.firestore.FieldValue.increment(totalBiayaMarketplaceBatal),
                    labaKotor: admin.firestore.FieldValue.increment(-labaKotorChange),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(-labaBersihChange),
                    totalQty: admin.firestore.FieldValue.increment(totalQtyRetur),
                }
            },
            yearlyTotals: {
                nilaiRetur: admin.firestore.FieldValue.increment(-totalNilaiRetur),
                omsetBersih: admin.firestore.FieldValue.increment(totalNilaiRetur),
                hppTerjual: admin.firestore.FieldValue.increment(totalHppRetur),
                biayaTransaksi: admin.firestore.FieldValue.increment(totalBiayaMarketplaceBatal),
                labaKotor: admin.firestore.FieldValue.increment(-labaKotorChange),
                labaBersihOperasional: admin.firestore.FieldValue.increment(-labaBersihChange),
                totalQty: admin.firestore.FieldValue.increment(totalQtyRetur),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});