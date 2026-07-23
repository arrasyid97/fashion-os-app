"use strict";

const {
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const {
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const FieldPath = admin.firestore.FieldPath;

const SUMMARY_COLLECTION = "dashboard_summaries_v2";
const EVENT_COLLECTION = "dashboard_summary_events_v2";
const SUMMARY_SCHEMA_VERSION = 2;
const SUMMARY_TIME_ZONE = "Asia/Jakarta";

const METRIC_FIELDS = [
  "omsetKotor",
  "totalDiskon",
  "totalHppTerjual",
  "totalBiayaTransaksi",
  "totalBiayaOperasional",
  "totalNilaiRetur",
  "pemasukanLain",
  "totalQty",
  "chartLabaKotor",
  "chartBiayaOperasional",
  "salesGross",
  "salesHpp",
  "salesFees",
  "salesQty",
  "salesOrders",
];

const GLOBAL_FIELDS = [
  "cashBalance",
  "pendingFunds",
  "pendingQty",
  "totalUnitStok",
  "totalNilaiStokHPP",
];

const PRODUCTION_KEYWORDS = [
  "kain",
  "jahit",
  "maklun",
  "supplier",
  "produksi",
  "bahan",
  "aksesoris",
  "resleting",
  "kancing",
  "label",
  "hangtag",
  "bordir",
  "payet",
  "obras",
  "kerugian stok",
];

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActiveRecord(data) {
  if (!data) return false;

  const status = String(
      data.status ||
      data.statusData ||
      data.statusProses ||
      "",
  ).toLowerCase();

  return !(
    data.isDeleted === true ||
    data.deleted === true ||
    data.archived === true ||
    data.deletedAt ||
    status === "deleted" ||
    status === "dihapus" ||
    status === "arsip" ||
    status === "archived"
  );
}

function toDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value.seconds) {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function dateKeyFromValue(value) {
  const date = toDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SUMMARY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};
  parts.forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  });

  if (!values.year || !values.month || !values.day) {
    return null;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function emptyMetrics() {
  return Object.fromEntries(
      METRIC_FIELDS.map((field) => [field, 0]),
  );
}

function emptyGlobal() {
  return Object.fromEntries(
      GLOBAL_FIELDS.map((field) => [field, 0]),
  );
}

function emptyAggregate() {
  return {
    metrics: emptyMetrics(),
    channels: {},
  };
}

function normalizeStatus(value) {
  return String(value || "")
      .trim()
      .toLocaleLowerCase("id-ID");
}

function isSettledStatus(value) {
  return normalizeStatus(value) === "sudah cair";
}

function isPendingStatus(value) {
  const status = normalizeStatus(value);
  return (
    !status ||
    status === "belum cair" ||
    status === "waiting"
  );
}

function isReturnedStatus(value) {
  const status = normalizeStatus(value);
  return (
    status === "retur/pengembalian" ||
    status === "retur / pengembalian" ||
    status === "retur"
  );
}

function transactionAmounts(data) {
  const discount = safeNumber(
      data?.diskon?.totalDiscount ??
      data?.totalDiscount ??
      data?.discount,
  );

  const storedSubtotal = Number(data?.subtotal);
  const storedTotal = Number(
      data?.total ??
      data?.grandTotal,
  );

  const itemSubtotal = (data?.items || []).reduce(
      (sum, item) => {
        const qty = safeNumber(item?.qty);
        const price = safeNumber(
            item?.hargaJualAktual ??
            item?.hargaJual ??
            item?.price ??
            item?.harga,
        );
        return sum + (price * qty);
      },
      0,
  );

  const gross = Number.isFinite(storedSubtotal) ?
    storedSubtotal :
    (
      itemSubtotal ||
      (
        Number.isFinite(storedTotal) ?
          storedTotal + discount :
          0
      )
    );

  const net = Number.isFinite(storedTotal) ?
    storedTotal :
    gross - discount;

  const hpp = (data?.items || []).reduce(
      (sum, item) => (
        sum +
        (
          safeNumber(item?.hpp) *
          safeNumber(item?.qty)
        )
      ),
      0,
  );

  const qty = (data?.items || []).reduce(
      (sum, item) => sum + safeNumber(item?.qty),
      0,
  );

  const fees = safeNumber(
      data?.biaya?.total ??
      data?.totalBiaya,
  );

  return {
    gross,
    discount,
    net,
    hpp,
    qty,
    fees,
    payout: net - fees,
  };
}

function transactionContribution(
    data,
    settledOverride = null,
) {
  if (!data?.userId || !isActiveRecord(data)) {
    return null;
  }

  const amounts = transactionAmounts(data);
  const settled = settledOverride === null ?
    (
      isSettledStatus(data.statusPencairan) ||
      (
        isReturnedStatus(data.statusPencairan) &&
        isSettledStatus(
            data.statusPencairanSebelumRetur,
        )
      )
    ) :
    settledOverride;
  const pending = isPendingStatus(data.statusPencairan);

  const contribution = {
    userId: data.userId,
    dateKey: null,
    metrics: emptyMetrics(),
    channels: {},
    global: emptyGlobal(),
    additionalPeriods: [],
  };

  const salesDateKey = dateKeyFromValue(data.tanggal);
  if (salesDateKey) {
    const salesMetrics = emptyMetrics();
    salesMetrics.salesGross = amounts.gross;
    salesMetrics.salesHpp = amounts.hpp;
    salesMetrics.salesFees = amounts.fees;
    salesMetrics.salesQty = amounts.qty;
    salesMetrics.salesOrders = 1;

    contribution.additionalPeriods.push({
      dateKey: salesDateKey,
      metrics: salesMetrics,
      channels: {},
    });
  }

  if (settled) {
    contribution.dateKey = dateKeyFromValue(
        data.tanggalPencairan ||
        data.tanggal,
    );

    contribution.metrics.omsetKotor = amounts.gross;
    contribution.metrics.totalDiskon = amounts.discount;
    contribution.metrics.totalHppTerjual = amounts.hpp;
    contribution.metrics.totalBiayaTransaksi = amounts.fees;
    contribution.metrics.totalQty = amounts.qty;
    contribution.metrics.chartLabaKotor =
      amounts.net - amounts.hpp;

    const channelName = String(
        data.channel ||
        data.channelId ||
        "Tanpa Channel",
    ).trim() || "Tanpa Channel";

    contribution.channels[
        encodeURIComponent(channelName)
    ] = amounts.net;

    contribution.global.cashBalance = amounts.payout;
  } else if (pending) {
    contribution.global.pendingFunds = amounts.payout;
    contribution.global.pendingQty = amounts.qty;
  }

  return contribution;
}

function productContribution(data) {
  if (!data?.userId || !isActiveRecord(data)) {
    return null;
  }

  const stock = safeNumber(
      data.physical_stock ??
      data.stokFisik,
  );

  const hpp = safeNumber(data.hpp);

  return {
    userId: data.userId,
    dateKey: null,
    metrics: emptyMetrics(),
    channels: {},
    global: {
      ...emptyGlobal(),
      totalUnitStok: stock,
      totalNilaiStokHPP: stock * hpp,
    },
  };
}

function defaultExpenseType(categoryName) {
  const normalized = String(categoryName || "")
      .toLocaleLowerCase("id-ID");

  return PRODUCTION_KEYWORDS.some(
      (keyword) => normalized.includes(keyword),
  ) ?
    "produksi" :
    "operasional";
}

function financeContribution(data, categoryType = "") {
  if (!data?.userId || !isActiveRecord(data)) {
    return null;
  }

  const dateKey = dateKeyFromValue(data.tanggal);
  const amount = safeNumber(
      data.jumlah ??
      data.amount ??
      data.nominal,
  );

  const kind = normalizeStatus(data.jenis);
  const resolvedExpenseType = normalizeStatus(
      data.tipeBiaya ||
      categoryType ||
      defaultExpenseType(data.kategori),
  );

  const contribution = {
    userId: data.userId,
    dateKey,
    metrics: emptyMetrics(),
    channels: {},
    global: emptyGlobal(),
  };

  if (kind === "pemasukan_lain") {
    contribution.metrics.pemasukanLain = amount;
    contribution.global.cashBalance = amount;
  } else if (
    kind === "pengeluaran" ||
    kind === "biaya"
  ) {
    contribution.global.cashBalance = -amount;

    if (resolvedExpenseType !== "produksi") {
      contribution.metrics.totalBiayaOperasional = amount;
      contribution.metrics.chartBiayaOperasional = amount;
    }
  }

  return contribution;
}

function returnItemAmounts(item, productHpp = 0) {
  const qty = safeNumber(item?.qty);
  const discount = safeNumber(item?.nilaiDiskon);
  const netReturn = safeNumber(item?.nilaiRetur);
  const grossReturn = netReturn + discount;
  const marketplaceFee = safeNumber(item?.biayaMarketplace);
  const hpp = safeNumber(
      item?.hpp ??
      productHpp,
  ) * qty;

  return {
    qty,
    discount,
    netReturn,
    grossReturn,
    marketplaceFee,
    hpp,
  };
}

function returnContribution(
    data,
    productHppBySku = new Map(),
    originWasSettled = null,
) {
  if (
    !data?.userId ||
    !isActiveRecord(data) ||
    !Array.isArray(data.items)
  ) {
    return null;
  }

  const contribution = {
    userId: data.userId,
    dateKey: dateKeyFromValue(
        data.tanggal ||
        data.createdAt,
    ),
    metrics: emptyMetrics(),
    channels: {},
    global: emptyGlobal(),
  };

  const wasSettled = originWasSettled === null ?
    isSettledStatus(
        data.statusPencairanSebelumRetur,
    ) :
    originWasSettled;

  data.items.forEach((item) => {
    const skuKey = String(item?.sku || "")
        .trim()
        .toLocaleLowerCase("id-ID");

    const amounts = returnItemAmounts(
        item,
        productHppBySku.get(skuKey) || 0,
    );

    contribution.metrics.totalNilaiRetur +=
      amounts.grossReturn;

    if (wasSettled) {
      contribution.metrics.omsetKotor -=
        amounts.grossReturn;
      contribution.metrics.totalDiskon -=
        amounts.discount;
      contribution.metrics.totalHppTerjual -=
        amounts.hpp;
      contribution.metrics.totalBiayaTransaksi -=
        amounts.marketplaceFee;
      contribution.metrics.totalQty -=
        amounts.qty;

      // Retur transaksi yang sudah cair mengurangi kas sebesar nilai
      // bersih yang dikembalikan. Biaya marketplace yang dibatalkan
      // ditambahkan kembali karena sebelumnya sudah mengurangi kas.
      contribution.global.cashBalance +=
        -amounts.netReturn +
        amounts.marketplaceFee;
    }
  });

  return contribution;
}

async function loadProductHppBySku(userId, items) {
  const result = new Map();
  const itemsWithoutStoredHpp = [];

  (items || []).forEach((item) => {
    const sku = String(item?.sku || "").trim();
    if (!sku) return;

    const storedHpp = Number(item?.hpp);
    if (Number.isFinite(storedHpp)) {
      result.set(
          sku.toLocaleLowerCase("id-ID"),
          storedHpp,
      );
    } else {
      itemsWithoutStoredHpp.push(item);
    }
  });

  const uniqueSkus = Array.from(
      new Set(
          itemsWithoutStoredHpp
              .map((item) => String(item?.sku || "").trim())
              .filter(Boolean),
      ),
  );

  await Promise.all(
      uniqueSkus.map(async (sku) => {
        const snapshot = await db
            .collection("products")
            .where("sku", "==", sku)
            .get();

        const ownedProduct = snapshot.docs.find(
            (documentSnapshot) => (
              documentSnapshot.data()?.userId === userId
            ),
        );

        if (ownedProduct) {
          result.set(
              sku.toLocaleLowerCase("id-ID"),
              safeNumber(ownedProduct.data()?.hpp),
          );
        }
      }),
  );

  return result;
}

async function resolveCategoryType(data) {
  if (!data?.userId || data.tipeBiaya || !data.kategori) {
    return data?.tipeBiaya || "";
  }

  const snapshot = await db
      .collection("categories")
      .where("name", "==", data.kategori)
      .get();

  const ownedCategory = snapshot.docs.find(
      (documentSnapshot) => (
        documentSnapshot.data()?.userId === data.userId
      ),
  );

  return (
    ownedCategory?.data()?.type ||
    defaultExpenseType(data.kategori)
  );
}

const RETURN_ORIGIN_FIELDS = [
  "marketplaceOrderId",
  "orderId",
  "idPesanan",
  "nomorPesanan",
];

function transactionOriginKeys(data) {
  return [
    data?.id,
    data?.marketplaceOrderId,
    data?.orderId,
    data?.idPesanan,
    data?.nomorPesanan,
  ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLocaleLowerCase("id-ID"))
      .filter(Boolean);
}

async function loadReturnOriginWasSettled(data) {
  const directDocumentId =
    data?.originalTransactionId ||
    data?.transactionId;

  if (directDocumentId) {
    const directSnapshot = await db
        .collection("transactions")
        .doc(String(directDocumentId))
        .get();

    if (
      directSnapshot.exists &&
      directSnapshot.data()?.userId === data.userId
    ) {
      return isSettledStatus(
          directSnapshot.data()?.statusPencairan,
      );
    }
  }

  const candidateValues = Array.from(
      new Set(
          [
            data?.marketplaceOrderId,
            data?.orderId,
            data?.idPesanan,
            data?.nomorPesanan,
          ].filter(Boolean).map(String),
      ),
  );

  for (const value of candidateValues) {
    for (const fieldName of RETURN_ORIGIN_FIELDS) {
      const snapshot = await db
          .collection("transactions")
          .where(fieldName, "==", value)
          .limit(20)
          .get();

      const ownedTransaction = snapshot.docs.find(
          (documentSnapshot) => (
            documentSnapshot.data()?.userId === data.userId
          ),
      );

      if (ownedTransaction) {
        return isSettledStatus(
            ownedTransaction.data()?.statusPencairan,
        );
      }
    }
  }

  return false;
}

function addNumberMap(target, source, multiplier = 1) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] =
      safeNumber(target[key]) +
      (safeNumber(value) * multiplier);
  });
}

function contributionPathMap(
    targetMap,
    contribution,
    multiplier,
) {
  if (!contribution?.userId) return;

  const rootPath =
    `${SUMMARY_COLLECTION}/${contribution.userId}`;

  if (!targetMap.has(rootPath)) {
    targetMap.set(rootPath, {
      metrics: {},
      channels: {},
      global: {},
      isRoot: true,
    });
  }

  addNumberMap(
      targetMap.get(rootPath).global,
      contribution.global,
      multiplier,
  );

  const addPeriodContribution = (
      dateKey,
      metrics,
      channels,
  ) => {
    if (!dateKey) return;

    const periodPaths = [
      `${rootPath}/days/${dateKey}`,
      `${rootPath}/months/${dateKey.slice(0, 7)}`,
    ];

    periodPaths.forEach((periodPath) => {
      if (!targetMap.has(periodPath)) {
        targetMap.set(periodPath, {
          metrics: {},
          channels: {},
          global: {},
          isRoot: false,
        });
      }

      const target = targetMap.get(periodPath);
      addNumberMap(
          target.metrics,
          metrics,
          multiplier,
      );
      addNumberMap(
          target.channels,
          channels,
          multiplier,
      );
    });
  };

  addPeriodContribution(
      contribution.dateKey,
      contribution.metrics,
      contribution.channels,
  );

  (contribution.additionalPeriods || []).forEach((period) => {
    addPeriodContribution(
        period.dateKey,
        period.metrics,
        period.channels,
    );
  });
}

function incrementObject(values) {
  const result = {};

  Object.entries(values || {}).forEach(([key, value]) => {
    const numericValue = safeNumber(value);
    if (numericValue !== 0) {
      result[key] = FieldValue.increment(numericValue);
    }
  });

  return result;
}

function encodeEventDocumentId(eventId) {
  return Buffer
      .from(String(eventId || "unknown"))
      .toString("base64url");
}

async function applyContributionEvent(
    event,
    beforeContribution,
    afterContribution,
) {
  const pathDeltas = new Map();

  contributionPathMap(
      pathDeltas,
      beforeContribution,
      -1,
  );

  contributionPathMap(
      pathDeltas,
      afterContribution,
      1,
  );

  const eventRef = db.doc(
      `${EVENT_COLLECTION}/${encodeEventDocumentId(event.id)}`,
  );

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);

    if (eventSnapshot.exists) {
      return;
    }

    pathDeltas.forEach((delta, documentPath) => {
      const updateData = {
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      };

      const metricIncrements = incrementObject(delta.metrics);
      const channelIncrements = incrementObject(delta.channels);
      const globalIncrements = incrementObject(delta.global);

      if (Object.keys(metricIncrements).length > 0) {
        updateData.metrics = metricIncrements;
      }

      if (Object.keys(channelIncrements).length > 0) {
        updateData.channels = channelIncrements;
      }

      if (Object.keys(globalIncrements).length > 0) {
        updateData.global = globalIncrements;
      }

      if (delta.isRoot) {
        updateData.version = FieldValue.increment(1);
      }

      transaction.set(
          db.doc(documentPath),
          updateData,
          {merge: true},
      );
    });

    transaction.set(eventRef, {
      processedAt: FieldValue.serverTimestamp(),
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      userIds: Array.from(
          new Set(
              [
                beforeContribution?.userId,
                afterContribution?.userId,
              ].filter(Boolean),
          ),
      ),
    });
  });
}

async function contributionFromReturnData(data) {
  if (!data?.userId) return null;

  const productHpp = await loadProductHppBySku(
      data.userId,
      data.items,
  );

  let originWasSettled = null;

  if (data.statusPencairanSebelumRetur) {
    originWasSettled = isSettledStatus(
        data.statusPencairanSebelumRetur,
    );
  } else {
    originWasSettled =
      await loadReturnOriginWasSettled(data);
  }

  return returnContribution(
      data,
      productHpp,
      originWasSettled,
  );
}

async function contributionFromFinanceData(data) {
  if (!data?.userId) return null;

  const categoryType = await resolveCategoryType(data);
  return financeContribution(data, categoryType);
}

exports.dashboardV2TransactionWritten = onDocumentWritten(
    "transactions/{transactionId}",
    async (event) => {
      const before = event.data.before.exists ?
        transactionContribution(event.data.before.data()) :
        null;

      const after = event.data.after.exists ?
        transactionContribution(event.data.after.data()) :
        null;

      return applyContributionEvent(event, before, after);
    },
);

exports.dashboardV2FinanceWritten = onDocumentWritten(
    "keuangan/{financeId}",
    async (event) => {
      const before = event.data.before.exists ?
        await contributionFromFinanceData(
            event.data.before.data(),
        ) :
        null;

      const after = event.data.after.exists ?
        await contributionFromFinanceData(
            event.data.after.data(),
        ) :
        null;

      return applyContributionEvent(event, before, after);
    },
);

exports.dashboardV2ReturnWritten = onDocumentWritten(
    "returns/{returnId}",
    async (event) => {
      const before = event.data.before.exists ?
        await contributionFromReturnData(
            event.data.before.data(),
        ) :
        null;

      const after = event.data.after.exists ?
        await contributionFromReturnData(
            event.data.after.data(),
        ) :
        null;

      return applyContributionEvent(event, before, after);
    },
);

exports.dashboardV2ProductWritten = onDocumentWritten(
    "products/{productId}",
    async (event) => {
      const before = event.data.before.exists ?
        productContribution(event.data.before.data()) :
        null;

      const after = event.data.after.exists ?
        productContribution(event.data.after.data()) :
        null;

      return applyContributionEvent(event, before, after);
    },
);

function aggregateContribution(
    dayMap,
    monthMap,
    globalTotals,
    contribution,
) {
  if (!contribution) return;

  addNumberMap(globalTotals, contribution.global);

  const addPeriodContribution = (
      dateKey,
      metrics,
      channels,
  ) => {
    if (!dateKey) return;

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, emptyAggregate());
    }

    const targetMonthKey = dateKey.slice(0, 7);
    if (!monthMap.has(targetMonthKey)) {
      monthMap.set(targetMonthKey, emptyAggregate());
    }

    [dayMap.get(dateKey), monthMap.get(targetMonthKey)]
        .forEach((target) => {
          addNumberMap(target.metrics, metrics);
          addNumberMap(target.channels, channels);
        });
  };

  addPeriodContribution(
      contribution.dateKey,
      contribution.metrics,
      contribution.channels,
  );

  (contribution.additionalPeriods || []).forEach((period) => {
    addPeriodContribution(
        period.dateKey,
        period.metrics,
        period.channels,
    );
  });
}

async function deleteCollectionDocuments(collectionReference) {
  const snapshot = await collectionReference.get();
  if (snapshot.empty) return;

  const bulkWriter = db.bulkWriter();
  snapshot.docs.forEach((documentSnapshot) => {
    bulkWriter.delete(documentSnapshot.ref);
  });
  await bulkWriter.close();
}

function mapDocuments(snapshot) {
  return snapshot.docs.map((documentSnapshot) => ({
    ...documentSnapshot.data(),
    id: documentSnapshot.id,
  }));
}

async function rebuildSummaryForUser(userId) {
  const rootRef = db.doc(`${SUMMARY_COLLECTION}/${userId}`);

  await rootRef.set({
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    ready: false,
    rebuilding: true,
    rebuildStartedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  const [
    transactionSnapshot,
    financeSnapshot,
    returnSnapshot,
    productSnapshot,
    categorySnapshot,
  ] = await Promise.all([
    db.collection("transactions")
        .where("userId", "==", userId)
        .get(),
    db.collection("keuangan")
        .where("userId", "==", userId)
        .get(),
    db.collection("returns")
        .where("userId", "==", userId)
        .get(),
    db.collection("products")
        .where("userId", "==", userId)
        .get(),
    db.collection("categories")
        .where("userId", "==", userId)
        .get(),
  ]);

  const products = mapDocuments(productSnapshot);
  const transactions = mapDocuments(transactionSnapshot);
  const returns = mapDocuments(returnSnapshot);
  const productHppBySku = new Map();

  products.forEach((product) => {
    const skuKey = String(product.sku || "")
        .trim()
        .toLocaleLowerCase("id-ID");

    if (skuKey) {
      productHppBySku.set(
          skuKey,
          safeNumber(product.hpp),
      );
    }
  });

  const categoryTypeByName = new Map();
  mapDocuments(categorySnapshot).forEach((category) => {
    if (category.name) {
      categoryTypeByName.set(
          category.name,
          category.type || "",
      );
    }
  });

  const dayMap = new Map();
  const monthMap = new Map();
  const globalTotals = emptyGlobal();
  const settledStatusByOriginKey = new Map();
  const settledReturnOriginKeys = new Set();

  returns.forEach((data) => {
    if (
      !isSettledStatus(
          data.statusPencairanSebelumRetur,
      )
    ) {
      return;
    }

    [
      data.originalTransactionId,
      data.transactionId,
      data.marketplaceOrderId,
      data.orderId,
      data.idPesanan,
      data.nomorPesanan,
    ]
        .filter(Boolean)
        .map((value) => (
          String(value)
              .trim()
              .toLocaleLowerCase("id-ID")
        ))
        .forEach((key) => {
          settledReturnOriginKeys.add(key);
        });
  });

  transactions.forEach((data) => {
    const originKeys = transactionOriginKeys(data);
    const effectiveSettled = (
      isSettledStatus(data.statusPencairan) ||
      (
        isReturnedStatus(data.statusPencairan) &&
        (
          isSettledStatus(
              data.statusPencairanSebelumRetur,
          ) ||
          originKeys.some(
              (key) => settledReturnOriginKeys.has(key),
          )
        )
      )
    );

    originKeys.forEach((key) => {
      settledStatusByOriginKey.set(
          key,
          effectiveSettled,
      );
    });

    aggregateContribution(
        dayMap,
        monthMap,
        globalTotals,
        transactionContribution(
            data,
            effectiveSettled,
        ),
    );
  });

  mapDocuments(financeSnapshot).forEach((data) => {
    aggregateContribution(
        dayMap,
        monthMap,
        globalTotals,
        financeContribution(
            data,
            categoryTypeByName.get(data.kategori) || "",
        ),
    );
  });

  returns.forEach((data) => {
    let originWasSettled = null;

    if (data.statusPencairanSebelumRetur) {
      originWasSettled = isSettledStatus(
          data.statusPencairanSebelumRetur,
      );
    } else {
      const originKeys = [
        data.originalTransactionId,
        data.transactionId,
        data.marketplaceOrderId,
        data.orderId,
        data.idPesanan,
        data.nomorPesanan,
      ]
          .filter(Boolean)
          .map((value) => (
            String(value)
                .trim()
                .toLocaleLowerCase("id-ID")
          ));

      const matchedKey = originKeys.find(
          (key) => settledStatusByOriginKey.has(key),
      );

      originWasSettled = matchedKey ?
        settledStatusByOriginKey.get(matchedKey) :
        false;
    }

    aggregateContribution(
        dayMap,
        monthMap,
        globalTotals,
        returnContribution(
            data,
            productHppBySku,
            originWasSettled,
        ),
    );
  });

  products.forEach((data) => {
    aggregateContribution(
        dayMap,
        monthMap,
        globalTotals,
        productContribution(data),
    );
  });

  await Promise.all([
    deleteCollectionDocuments(rootRef.collection("days")),
    deleteCollectionDocuments(rootRef.collection("months")),
  ]);

  const bulkWriter = db.bulkWriter();

  dayMap.forEach((value, key) => {
    bulkWriter.set(
        rootRef.collection("days").doc(key),
        {
          schemaVersion: SUMMARY_SCHEMA_VERSION,
          key,
          ...value,
          rebuiltAt: FieldValue.serverTimestamp(),
        },
    );
  });

  monthMap.forEach((value, key) => {
    bulkWriter.set(
        rootRef.collection("months").doc(key),
        {
          schemaVersion: SUMMARY_SCHEMA_VERSION,
          key,
          ...value,
          rebuiltAt: FieldValue.serverTimestamp(),
        },
    );
  });

  await bulkWriter.close();

  await rootRef.set({
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    ready: true,
    rebuilding: false,
    global: globalTotals,
    version: FieldValue.increment(1),
    rebuiltAt: FieldValue.serverTimestamp(),
    sourceCounts: {
      transactions: transactionSnapshot.size,
      finance: financeSnapshot.size,
      returns: returnSnapshot.size,
      products: productSnapshot.size,
    },
  }, {merge: true});

  return {
    transactions: transactionSnapshot.size,
    finance: financeSnapshot.size,
    returns: returnSnapshot.size,
    products: productSnapshot.size,
    days: dayMap.size,
    months: monthMap.size,
  };
}

async function acquireRebuildLock(rootRef) {
  return db.runTransaction(async (transaction) => {
    const rootSnapshot = await transaction.get(rootRef);
    const rootData = rootSnapshot.data() || {};
    const startedAt = toDate(rootData.rebuildStartedAt);
    const lockIsRecent = (
      rootData.rebuilding === true &&
      startedAt &&
      (
        Date.now() - startedAt.getTime()
      ) < (15 * 60 * 1000)
    );

    if (lockIsRecent) {
      return false;
    }

    transaction.set(rootRef, {
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      ready: false,
      rebuilding: true,
      rebuildStartedAt: FieldValue.serverTimestamp(),
      rebuildError: FieldValue.delete(),
    }, {merge: true});

    return true;
  });
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseDateKey(value) {
  if (!isValidDateKey(value)) return null;

  const [year, month, day] = value
      .split("-")
      .map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function monthStart(date) {
  return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1,
  ));
}

function monthEnd(date) {
  return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
  ));
}

function monthKey(date) {
  return formatDateKey(date).slice(0, 7);
}

function isMonthStart(date) {
  return date.getUTCDate() === 1;
}

function isMonthEnd(date) {
  return (
    date.getUTCDate() ===
    monthEnd(date).getUTCDate()
  );
}

async function queryDocumentsByIdRange(
    collectionReference,
    startKey,
    endKey,
) {
  if (!startKey || !endKey || startKey > endKey) {
    return [];
  }

  const snapshot = await collectionReference
      .where(FieldPath.documentId(), ">=", startKey)
      .where(FieldPath.documentId(), "<=", endKey)
      .orderBy(FieldPath.documentId(), "asc")
      .get();

  return mapDocuments(snapshot);
}

async function loadPeriodDocuments(rootRef, requestData) {
  if (requestData?.allTime === true) {
    const snapshot = await rootRef
        .collection("months")
        .orderBy(FieldPath.documentId(), "asc")
        .get();

    return mapDocuments(snapshot);
  }

  const startDate = parseDateKey(requestData?.startDateKey);
  const endDate = parseDateKey(requestData?.endDateKey);

  if (!startDate || !endDate || startDate > endDate) {
    throw new HttpsError(
        "invalid-argument",
        "Rentang tanggal Dashboard tidak valid.",
    );
  }

  const dayRanges = [];
  let firstFullMonth;
  let lastFullMonth;

  if (isMonthStart(startDate)) {
    firstFullMonth = monthStart(startDate);
  } else {
    const startEdgeEnd = (
      monthEnd(startDate) < endDate ?
        monthEnd(startDate) :
        endDate
    );

    dayRanges.push([
      formatDateKey(startDate),
      formatDateKey(startEdgeEnd),
    ]);

    firstFullMonth = monthStart(
        addUtcDays(monthEnd(startDate), 1),
    );
  }

  if (isMonthEnd(endDate)) {
    lastFullMonth = monthStart(endDate);
  } else {
    const endEdgeStart = monthStart(endDate);

    if (
      dayRanges.length === 0 ||
      dayRanges[0][1] < formatDateKey(endEdgeStart)
    ) {
      dayRanges.push([
        formatDateKey(
            endEdgeStart < startDate ?
              startDate :
              endEdgeStart,
        ),
        formatDateKey(endDate),
      ]);
    }

    lastFullMonth = monthStart(
        addUtcDays(monthStart(endDate), -1),
    );
  }

  const reads = dayRanges.map(([startKey, endKey]) => (
    queryDocumentsByIdRange(
        rootRef.collection("days"),
        startKey,
        endKey,
    )
  ));

  if (firstFullMonth <= lastFullMonth) {
    reads.push(
        queryDocumentsByIdRange(
            rootRef.collection("months"),
            monthKey(firstFullMonth),
            monthKey(lastFullMonth),
        ),
    );
  }

  const groups = await Promise.all(reads);
  const documentsByKey = new Map();

  groups.flat().forEach((document) => {
    documentsByKey.set(document.id, document);
  });

  return Array.from(documentsByKey.values())
      .sort((a, b) => a.id.localeCompare(b.id));
}

function summarizeDocuments(documents) {
  const aggregate = emptyAggregate();

  (documents || []).forEach((document) => {
    addNumberMap(aggregate.metrics, document.metrics);
    addNumberMap(aggregate.channels, document.channels);
  });

  const metrics = aggregate.metrics;
  metrics.omsetBersih =
    metrics.omsetKotor -
    metrics.totalDiskon;

  metrics.labaKotor =
    metrics.omsetBersih -
    metrics.totalHppTerjual;

  metrics.labaBersih =
    metrics.labaKotor -
    metrics.totalBiayaTransaksi -
    metrics.totalBiayaOperasional;

  return {
    metrics,
    channels: Object.fromEntries(
        Object.entries(aggregate.channels).map(
            ([key, value]) => {
              let decodedKey = key;
              try {
                decodedKey = decodeURIComponent(key);
              } catch (error) {
                decodedKey = key;
              }
              return [decodedKey, safeNumber(value)];
            },
        ),
    ),
  };
}

function seriesFromDocuments(documents) {
  return (documents || []).map((document) => {
    const metrics = {
      ...emptyMetrics(),
      ...(document.metrics || {}),
    };

    return {
      key: document.id,
      labaKotor: safeNumber(metrics.chartLabaKotor),
      biayaOperasional: safeNumber(
          metrics.chartBiayaOperasional,
      ),
      channels: Object.fromEntries(
          Object.entries(document.channels || {}).map(
              ([key, value]) => {
                let decodedKey = key;
                try {
                  decodedKey = decodeURIComponent(key);
                } catch (error) {
                  decodedKey = key;
                }
                return [decodedKey, safeNumber(value)];
              },
          ),
      ),
    };
  });
}

function todaySummaryFromDocument(document) {
  const metrics = {
    ...emptyMetrics(),
    ...(document?.metrics || {}),
  };

  const omsetHariIni = safeNumber(metrics.salesGross);
  const hppHariIni = safeNumber(metrics.salesHpp);
  const biayaTransaksiHariIni = safeNumber(metrics.salesFees);
  const biayaOperasionalHariIni = safeNumber(
      metrics.totalBiayaOperasional,
  );

  return {
    omsetHariIni,
    profitBersihHariIni:
      omsetHariIni -
      hppHariIni -
      biayaTransaksiHariIni -
      biayaOperasionalHariIni,
    orderHariIni: safeNumber(metrics.salesOrders),
    produkTerjualHariIni: safeNumber(metrics.salesQty),
  };
}

exports.rebuildDashboardSummaryV2 = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
        "unauthenticated",
        "Silakan login kembali.",
    );
  }

  const rootRef = db.doc(
      `${SUMMARY_COLLECTION}/${request.auth.uid}`,
  );

  const lockAcquired = await acquireRebuildLock(rootRef);
  if (!lockAcquired) {
    throw new HttpsError(
        "aborted",
        "Ringkasan Dashboard sedang dibuat. Tunggu sebentar.",
    );
  }

  try {
    const counts = await rebuildSummaryForUser(
        request.auth.uid,
    );

    return {
      ok: true,
      ready: true,
      counts,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
    };
  } catch (error) {
    await rootRef.set({
      ready: false,
      rebuilding: false,
      rebuildError: String(error?.message || error),
      rebuildFailedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    console.error(
        "[DASHBOARD V2] Backfill gagal:",
        request.auth.uid,
        error,
    );

    throw new HttpsError(
        "internal",
        "Ringkasan belum berhasil dibuat. Dashboard lama tetap digunakan.",
    );
  }
});

exports.getDashboardSummaryV2 = onCall({
  timeoutSeconds: 120,
  memory: "512MiB",
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
        "unauthenticated",
        "Silakan login kembali.",
    );
  }

  const rootRef = db.doc(
      `${SUMMARY_COLLECTION}/${request.auth.uid}`,
  );

  const rootSnapshot = await rootRef.get();
  const rootData = rootSnapshot.data() || {};

  if (
    !rootSnapshot.exists ||
    rootData.ready !== true ||
    rootData.schemaVersion !== SUMMARY_SCHEMA_VERSION
  ) {
    return {
      ready: false,
      rebuilding: rootData.rebuilding === true,
      schemaVersion: rootData.schemaVersion || 0,
    };
  }

  if (request.data?.globalOnly === true) {
    return {
      ready: true,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      version: safeNumber(rootData.version),
      global: {
        ...emptyGlobal(),
        ...(rootData.global || {}),
      },
      source: "dashboard_summaries_v2",
    };
  }

  const requestedKnownVersion = Number(
      request.data?.knownVersion,
  );

  if (
    Number.isFinite(requestedKnownVersion) &&
    requestedKnownVersion === safeNumber(rootData.version)
  ) {
    return {
      ready: true,
      unchanged: true,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      version: safeNumber(rootData.version),
      global: {
        ...emptyGlobal(),
        ...(rootData.global || {}),
      },
      source: "dashboard_summaries_v2",
      readDocuments: 1,
    };
  }

  const periodDocuments = await loadPeriodDocuments(
      rootRef,
      request.data || {},
  );

  const summarized = summarizeDocuments(periodDocuments);
  const todayDateKey = isValidDateKey(
      request.data?.todayDateKey,
  ) ?
    request.data.todayDateKey :
    dateKeyFromValue(new Date());

  let todayDocument = periodDocuments.find(
      (document) => document.id === todayDateKey,
  );

  let todayReadCount = 0;
  if (!todayDocument && todayDateKey) {
    const todaySnapshot = await rootRef
        .collection("days")
        .doc(todayDateKey)
        .get();

    todayReadCount = 1;

    if (todaySnapshot.exists) {
      todayDocument = {
        ...todaySnapshot.data(),
        id: todaySnapshot.id,
      };
    }
  }

  return {
    ready: true,
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    version: safeNumber(rootData.version),
    global: {
      ...emptyGlobal(),
      ...(rootData.global || {}),
    },
    metrics: summarized.metrics,
    channels: summarized.channels,
    series: seriesFromDocuments(periodDocuments),
    today: todaySummaryFromDocument(todayDocument),
    source: "dashboard_summaries_v2",
    readDocuments:
      periodDocuments.length +
      todayReadCount +
      1,
  };
});
