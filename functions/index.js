const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
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

exports.updateSummaryOnNewExpense = onDocumentCreated("keuangan/{financeId}", async (event) => {
    const financeData = event.data.data();
    const { userId, tanggal, jenis, jumlah } = financeData;
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
                    biayaOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
                }
            },
            // --- PERBAIKAN DI SINI: Menambahkan yearlyTotals ---
            yearlyTotals: {
                biayaOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
                labaBersihOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
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
                    labaBersihOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
                }
            },
            // --- PERBAIKAN DI SINI: Menambahkan yearlyTotals ---
            yearlyTotals: {
                biayaOperasional: admin.firestore.FieldValue.increment(-biayaOperasional),
                labaBersihOperasional: admin.firestore.FieldValue.increment(biayaOperasional),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnNewReturn = onDocumentCreated("returns/{returnId}", async (event) => {
    const returnData = event.data.data();
    const { userId, tanggal, items } = returnData;
    if (!userId || !items || items.length === 0) return null;

    let totalNilaiReturGross = 0;
    let totalBiayaMarketplaceBatal = 0;
    let totalHppRetur = 0;
    let totalQtyRetur = 0;
    let totalDiskonBatal = 0; // <-- Variabel baru untuk menghitung diskon

    for (const item of items) {
        totalNilaiReturGross += (item.nilaiRetur || 0) + (item.nilaiDiskon || 0); 
        totalBiayaMarketplaceBatal += item.biayaMarketplace || 0;
        totalQtyRetur += item.qty || 0;
        totalDiskonBatal += item.nilaiDiskon || 0; // <-- PERBAIKAN: Hitung diskon yang dibatalkan
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
    
    const omsetBersihChange = (items.reduce((sum, item) => sum + (item.nilaiRetur || 0), 0));
    const labaKotorChange = totalHppRetur - omsetBersihChange;
    const labaBersihChange = labaKotorChange + totalBiayaMarketplaceBatal;

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    omsetKotor: admin.firestore.FieldValue.increment(-totalNilaiReturGross),
                    totalDiskon: admin.firestore.FieldValue.increment(-totalDiskonBatal), // <-- PERBAIKAN: Kurangi total diskon
                    nilaiRetur: admin.firestore.FieldValue.increment(totalNilaiReturGross),
                    omsetBersih: admin.firestore.FieldValue.increment(-omsetBersihChange),
                    hppTerjual: admin.firestore.FieldValue.increment(-totalHppRetur),
                    biayaTransaksi: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
                    labaKotor: admin.firestore.FieldValue.increment(labaKotorChange),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihChange),
                    totalQty: admin.firestore.FieldValue.increment(-totalQtyRetur),
                }
            },
            yearlyTotals: {
                omsetKotor: admin.firestore.FieldValue.increment(-totalNilaiReturGross),
                totalDiskon: admin.firestore.FieldValue.increment(-totalDiskonBatal), // <-- PERBAIKAN: Kurangi total diskon
                nilaiRetur: admin.firestore.FieldValue.increment(totalNilaiReturGross),
                omsetBersih: admin.firestore.FieldValue.increment(-omsetBersihChange),
                hppTerjual: admin.firestore.FieldValue.increment(-totalHppRetur),
                biayaTransaksi: admin.firestore.FieldValue.increment(-totalBiayaMarketplaceBatal),
                labaKotor: admin.firestore.FieldValue.increment(labaKotorChange),
                labaBersihOperasional: admin.firestore.FieldValue.increment(labaBersihChange),
                totalQty: admin.firestore.FieldValue.increment(-totalQtyRetur),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

exports.updateSummaryOnDeleteReturn = onDocumentDeleted("returns/{returnId}", async (event) => {
    const deletedData = event.data.data();
    const { userId, tanggal, items } = deletedData;
    if (!userId || !items || items.length === 0) return null;

    let totalNilaiReturGross = 0;
    let totalBiayaMarketplaceBatal = 0;
    let totalHppRetur = 0;
    let totalQtyRetur = 0;
    let totalDiskonBatal = 0; // <-- Variabel baru untuk menghitung diskon

    for (const item of items) {
        totalNilaiReturGross += (item.nilaiRetur || 0) + (item.nilaiDiskon || 0);
        totalBiayaMarketplaceBatal += item.biayaMarketplace || 0;
        totalQtyRetur += item.qty || 0;
        totalDiskonBatal += item.nilaiDiskon || 0; // <-- PERBAIKAN: Hitung diskon yang dibatalkan
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
    
    const omsetBersihChange = (items.reduce((sum, item) => sum + (item.nilaiRetur || 0), 0));
    const labaKotorChange = totalHppRetur - omsetBersihChange;
    const labaBersihChange = labaKotorChange + totalBiayaMarketplaceBatal;

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    omsetKotor: admin.firestore.FieldValue.increment(totalNilaiReturGross),
                    totalDiskon: admin.firestore.FieldValue.increment(totalDiskonBatal), // <-- PERBAIKAN: Kembalikan total diskon
                    nilaiRetur: admin.firestore.FieldValue.increment(-totalNilaiReturGross),
                    omsetBersih: admin.firestore.FieldValue.increment(omsetBersihChange),
                    hppTerjual: admin.firestore.FieldValue.increment(totalHppRetur),
                    biayaTransaksi: admin.firestore.FieldValue.increment(totalBiayaMarketplaceBatal),
                    labaKotor: admin.firestore.FieldValue.increment(-labaKotorChange),
                    labaBersihOperasional: admin.firestore.FieldValue.increment(-labaBersihChange),
                    totalQty: admin.firestore.FieldValue.increment(totalQtyRetur),
                }
            },
            yearlyTotals: {
                omsetKotor: admin.firestore.FieldValue.increment(totalNilaiReturGross),
                totalDiskon: admin.firestore.FieldValue.increment(totalDiskonBatal), // <-- PERBAIKAN: Kembalikan total diskon
                nilaiRetur: admin.firestore.FieldValue.increment(-totalNilaiReturGross),
                omsetBersih: admin.firestore.FieldValue.increment(omsetBersihChange),
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

exports.updateSummaryOnNewIncome = onDocumentCreated("keuangan/{financeId}", async (event) => {
    const financeData = event.data.data();
    const { userId, tanggal, jenis, jumlah } = financeData;
    if (jenis !== "pemasukan_lain" || !userId) return null;

    const pemasukanLain = jumlah || 0;
    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const summaryRef = db.doc(`user_summaries/${userId}`);

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    pemasukanLain: admin.firestore.FieldValue.increment(pemasukanLain),
                }
            },
            yearlyTotals: {
                pemasukanLain: admin.firestore.FieldValue.increment(pemasukanLain),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});

// Fungsi ini akan MENGURANGI pemasukan_lain dari summary saat dihapus
exports.updateSummaryOnDeleteIncome = onDocumentDeleted("keuangan/{financeId}", async (event) => {
    const deletedData = event.data.data();
    const { userId, tanggal, jenis, jumlah } = deletedData;
    if (jenis !== "pemasukan_lain" || !userId) return null;

    const pemasukanLain = jumlah || 0;
    const date = tanggal.toDate();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const summaryRef = db.doc(`user_summaries/${userId}`);

    const updateData = {
        [`summary_${year}`]: {
            months: {
                [month]: {
                    pemasukanLain: admin.firestore.FieldValue.increment(-pemasukanLain),
                }
            },
            yearlyTotals: {
                pemasukanLain: admin.firestore.FieldValue.increment(-pemasukanLain),
            }
        }
    };
    return summaryRef.set(updateData, { merge: true });
});
// ============================================================
// PENANDA VERSI DATA USER UNTUK SINKRONISASI CACHE
// ============================================================

// Nama function Firebase, nama koleksi, dan kelompok datanya.
const syncTrackedCollections = {
  syncTransactions: {
    collectionName: "transactions",
    moduleName: "sales",
  },

  syncReturns: {
    collectionName: "returns",
    moduleName: "sales",
  },

  syncProducts: {
    collectionName: "products",
    moduleName: "products",
  },

  syncProductPrices: {
    collectionName: "product_prices",
    moduleName: "products",
  },

  syncStockAllocations: {
    collectionName: "stock_allocations",
    moduleName: "products",
  },

  syncFinance: {
    collectionName: "keuangan",
    moduleName: "finance",
  },

  syncProductionBatches: {
    collectionName: "production_batches",
    moduleName: "production",
  },

  syncFabricStock: {
    collectionName: "fabric_stock",
    moduleName: "production",
  },

  syncSuppliers: {
    collectionName: "suppliers",
    moduleName: "suppliers",
  },

  syncPurchaseOrders: {
    collectionName: "purchase_orders",
    moduleName: "suppliers",
  },

  syncVoucherNotes: {
    collectionName: "voucher_notes",
    moduleName: "notes",
  },

  syncInvestors: {
    collectionName: "investors",
    moduleName: "investment",
  },

  syncInvestorPayments: {
    collectionName: "investor_payments",
    moduleName: "investment",
  },

  syncBankAccounts: {
    collectionName: "bank_accounts",
    moduleName: "investment",
  },

  syncCategories: {
    collectionName: "categories",
    moduleName: "settings",
  },

  // Pada koleksi ini, ID dokumennya adalah UID user.
  syncSettings: {
    collectionName: "settings",
    moduleName: "settings",
    userIdFromDocumentId: true,
  },

  syncPromotions: {
    collectionName: "promotions",
    moduleName: "settings",
    userIdFromDocumentId: true,
  },

  syncProductCommissions: {
    collectionName: "product_commissions",
    moduleName: "settings",
    userIdFromDocumentId: true,
  },
};


// Mengambil data terbaru.
// Jika dokumen dihapus, data diambil dari kondisi sebelum dihapus.
function getSyncEventData(event) {
  if (event.data.after.exists) {
    return event.data.after.data() || {};
  }

  if (event.data.before.exists) {
    return event.data.before.data() || {};
  }

  return {};
}


// Menentukan jenis perubahan untuk kebutuhan pemeriksaan.
function getSyncOperation(event) {
  const beforeExists = event.data.before.exists;
  const afterExists = event.data.after.exists;

  if (!beforeExists && afterExists) {
    return "created";
  }

  if (beforeExists && !afterExists) {
    return "deleted";
  }

  return "updated";
}


// Mencari UID pemilik dokumen.
async function resolveSyncUserId(event, config) {
  // Settings dan beberapa pengaturan lain memakai UID
  // sebagai ID dokumen.
  if (config.userIdFromDocumentId) {
    return event.params.documentId || null;
  }

  const data = getSyncEventData(event);

  // Sebagian besar koleksi sudah mempunyai field userId.
  if (data.userId) {
    return data.userId;
  }

  // Perlindungan untuk data harga atau alokasi lama
  // yang mungkin belum mempunyai field userId.
  const isProductRelated =
    config.collectionName === "product_prices" ||
    config.collectionName === "stock_allocations";

  if (!isProductRelated) {
    return null;
  }

  const productId =
    data.product_id ||
    data.productId ||
    (
      config.collectionName === "stock_allocations"
        ? event.params.documentId
        : null
    );

  if (!productId) {
    return null;
  }

  const productSnap =
    await db.doc(`products/${productId}`).get();

  if (!productSnap.exists) {
    return null;
  }

  return productSnap.data().userId || null;
}


// Membuat atau memperbarui user_sync/{uid}.
async function markUserDataChanged(event, config) {
  const userId = await resolveSyncUserId(
    event,
    config
  );

  if (!userId) {
    console.warn(
      "[SYNC VERSION] userId tidak ditemukan:",
      `${config.collectionName}/${event.params.documentId}`
    );

    return null;
  }

  const syncRef = db.doc(`user_sync/${userId}`);

  const moduleVersionField =
    `module_${config.moduleName}_version`;

  const moduleUpdatedAtField =
    `module_${config.moduleName}_updatedAt`;

  return syncRef.set({
    schemaVersion: 1,

    // Versi keseluruhan data user.
    version:
      admin.firestore.FieldValue.increment(1),

    updatedAt:
      admin.firestore.FieldValue.serverTimestamp(),

    // Versi khusus per kelompok data.
    [moduleVersionField]:
      admin.firestore.FieldValue.increment(1),

    [moduleUpdatedAtField]:
      admin.firestore.FieldValue.serverTimestamp(),

    // Hanya untuk membantu pemeriksaan.
    lastChange: {
      collection: config.collectionName,
      documentId: event.params.documentId,
      operation: getSyncOperation(event),
      eventId: event.id || null,
    },
  }, { merge: true });
}


// Membuat Cloud Function untuk setiap koleksi di atas.
Object.entries(syncTrackedCollections).forEach(
  ([functionName, config]) => {
    exports[functionName] = onDocumentWritten(
      `${config.collectionName}/{documentId}`,
      async (event) => {
        return markUserDataChanged(event, config);
      }
    );
  }
);