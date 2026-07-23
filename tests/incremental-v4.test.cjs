"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const babel = require("@babel/core");

function loadAdapters() {
  const filename = path.resolve(
      __dirname,
      "../src/incremental-adapters-v4.js",
  );

  const source = fs.readFileSync(
      filename,
      "utf8",
  );

  const transformed = babel.transformSync(
      source,
      {
        filename,
        plugins: [
          "@babel/plugin-transform-modules-commonjs",
        ],
      },
  );

  const loadedModule = new Module(
      filename,
      module,
  );

  loadedModule.filename = filename;
  loadedModule.paths =
    Module._nodeModulePaths(
        path.dirname(filename),
    );

  loadedModule._compile(
      transformed.code,
      filename,
  );

  return loadedModule.exports;
}

const {
  filterRowsByRangeV4,
  mergeFinanceChangesV4,
  mergeProductChangesV4,
  mergeSalesChangesV4,
  validateFinancePayloadV4,
  validateProductsPayloadV4,
  validateSalesPayloadV4,
} = loadAdapters();

const existingTransactions =
  Array.from(
      {length: 3001},
      (_, index) => ({
        id: `TRX-${index + 1}`,
        tanggal:
          new Date(
              2026,
              6,
              1,
              0,
              0,
              index % 60,
          ),
        total: index + 1,
      }),
  );

const salesPayload = {
  transactions:
    existingTransactions,
  returns: [
    {
      id: "RET-1",
      tanggal:
        new Date(2026, 6, 1),
    },
  ],
};

const oneNewTransaction =
  mergeSalesChangesV4(
      salesPayload,
      [
        {
          collectionName:
            "transactions",
          documentId: "TRX-3002",
          operation: "created",
          data: {
            tanggal:
              new Date(2026, 6, 23),
            total: 120000,
          },
        },
      ],
  );

assert.equal(
    oneNewTransaction.transactions.length,
    3002,
    "Satu transaksi baru harus menambah tepat satu baris.",
);

assert.equal(
    oneNewTransaction.transactions[0].id,
    "TRX-3002",
    "Transaksi terbaru harus berada di urutan pertama.",
);

const oneUpdatedTransaction =
  mergeSalesChangesV4(
      oneNewTransaction,
      [
        {
          collectionName:
            "transactions",
          documentId: "TRX-3002",
          operation: "updated",
          data: {
            tanggal:
              new Date(2026, 6, 23),
            total: 125000,
          },
        },
      ],
  );

assert.equal(
    oneUpdatedTransaction.transactions.length,
    3002,
    "Update tidak boleh membuat transaksi ganda.",
);

assert.equal(
    oneUpdatedTransaction.transactions[0].total,
    125000,
    "Update harus mengganti nilai dokumen lama.",
);

const oneDeletedTransaction =
  mergeSalesChangesV4(
      oneUpdatedTransaction,
      [
        {
          collectionName:
            "transactions",
          documentId: "TRX-3002",
          operation: "deleted",
          data: null,
        },
      ],
  );

assert.equal(
    oneDeletedTransaction.transactions.length,
    3001,
    "Delete harus menghapus tepat satu transaksi.",
);

const filteredTransactions =
  filterRowsByRangeV4(
      oneNewTransaction.transactions,
      {
        allTime: false,
        startDate:
          new Date(2026, 6, 23, 0, 0, 0),
        endDate:
          new Date(
              2026,
              6,
              23,
              23,
              59,
              59,
              999,
          ),
      },
  );

assert.deepEqual(
    filteredTransactions.map(
        row => row.id,
    ),
    ["TRX-3002"],
    "Filter waktu harus dihitung dari snapshot lokal secara akurat.",
);

const productsPayload = {
  products: [
    {
      docId: "P-1",
      nama: "SALWA",
      hargaJual: {},
      stokAlokasi: {},
    },
  ],
  productPrices: [
    {
      id: "PRICE-1",
      product_id: "P-1",
      marketplace_id: "MP-1",
      price: 100000,
    },
  ],
  stockAllocations: [
    {
      id: "P-1",
      "MP-1": 4,
    },
  ],
  visibleCount: 100,
};

const changedProducts =
  mergeProductChangesV4(
      productsPayload,
      [
        {
          collectionName:
            "product_prices",
          documentId: "PRICE-1",
          operation: "updated",
          data: {
            product_id: "P-1",
            marketplace_id: "MP-1",
            price: 110000,
          },
        },
        {
          collectionName: "products",
          documentId: "P-2",
          operation: "created",
          data: {
            product_name: "AISHA",
            model_id: "MODEL-AISHA",
            color: "Merah",
            variant: "M",
            physical_stock: 3,
            hpp: 55000,
          },
        },
      ],
  );

assert.equal(
    changedProducts.products.length,
    2,
);

assert.equal(
    changedProducts.products[0].nama,
    "AISHA",
);

assert.equal(
    changedProducts.productPrices[0].price,
    110000,
);

const financePayload = {
  rows: [
    {
      id: "FIN-1",
      tanggal:
        new Date(2026, 6, 1),
      jumlah: 50000,
    },
  ],
};

const changedFinance =
  mergeFinanceChangesV4(
      financePayload,
      [
        {
          collectionName: "keuangan",
          documentId: "FIN-2",
          operation: "created",
          data: {
            tanggal:
              new Date(2026, 6, 2),
            jumlah: 75000,
          },
        },
      ],
  );

assert.equal(
    changedFinance.rows.length,
    2,
);

assert.equal(
    validateSalesPayloadV4(
        oneNewTransaction,
    ),
    true,
);

assert.equal(
    validateProductsPayloadV4(
        changedProducts,
    ),
    true,
);

assert.equal(
    validateFinancePayloadV4(
        changedFinance,
    ),
    true,
);

console.log(
    "Incremental V4 adapter tests passed.",
);
