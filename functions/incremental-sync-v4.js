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

const ROOT_COLLECTION = "incremental_sync_v4";
const SCHEMA_VERSION = 4;
const MAX_CHANGES_PER_REQUEST = 500;

// Hanya koleksi besar yang perlu jurnal per dokumen. Modul kecil tetap
// memakai cache versi V3 agar jumlah Functions dan write tidak membengkak.
const TRACKED_COLLECTIONS = Object.freeze({
  transactions: "sales",
  returns: "sales",
  products: "products",
  product_prices: "products",
  stock_allocations: "products",
  keuangan: "finance",
});

const TRIGGER_COLLECTIONS = Object.freeze({
  syncTransactionsIncrementalV4:
    "transactions",
  syncReturnsIncrementalV4:
    "returns",
  syncProductsIncrementalV4:
    "products",
  syncProductPricesIncrementalV4:
    "product_prices",
  syncStockAllocationsIncrementalV4:
    "stock_allocations",
  syncFinanceIncrementalV4:
    "keuangan",
});

const MODULE_COLLECTIONS = Object.freeze({
  sales: new Set([
    "transactions",
    "returns",
  ]),
  products: new Set([
    "products",
    "product_prices",
    "stock_allocations",
  ]),
  finance: new Set([
    "keuangan",
  ]),
});

function getEventData(event) {
  if (event.data.after.exists) {
    return event.data.after.data() || {};
  }

  if (event.data.before.exists) {
    return event.data.before.data() || {};
  }

  return {};
}

function getOperation(event) {
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

async function resolveUserId(event, collectionName) {
  const data = getEventData(event);

  if (data.userId) {
    return data.userId;
  }

  const isProductRelated =
    collectionName === "product_prices" ||
    collectionName === "stock_allocations";

  if (!isProductRelated) {
    return null;
  }

  const productId =
    data.product_id ||
    data.productId ||
    (
      collectionName === "stock_allocations" ?
        event.params.documentId :
        null
    );

  if (!productId) {
    return null;
  }

  const productSnapshot =
    await db.doc(`products/${productId}`).get();

  if (!productSnapshot.exists) {
    return null;
  }

  return productSnapshot.data().userId || null;
}

async function recordIncrementalChange(
    event,
    collectionName,
) {
  const moduleName =
    TRACKED_COLLECTIONS[collectionName];

  if (!moduleName) {
    return null;
  }

  const userId =
    await resolveUserId(
        event,
        collectionName,
    );

  if (!userId) {
    console.warn(
        "[INCREMENTAL V4] userId tidak ditemukan:",
        `${collectionName}/${event.params.documentId}`,
    );

    return null;
  }

  const rootRef =
    db.doc(`${ROOT_COLLECTION}/${userId}`);

  const eventRef =
    rootRef
        .collection("modules")
        .doc(moduleName)
        .collection("changes")
        .doc(event.id);

  const versionField =
    `module_${moduleName}_version`;

  return db.runTransaction(
      async (transaction) => {
        const [
          existingEvent,
          rootSnapshot,
        ] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(rootRef),
        ]);

        // Eventarc dapat mengirim ulang event. ID event dijadikan kunci
        // agar versi tidak pernah bertambah dua kali untuk perubahan sama.
        if (existingEvent.exists) {
          return null;
        }

        const currentVersion =
          Number(
              rootSnapshot.data()?.[
                  versionField
              ],
          ) || 0;

        const nextVersion =
          currentVersion + 1;

        transaction.create(eventRef, {
          schemaVersion: SCHEMA_VERSION,
          moduleName,
          version: nextVersion,
          collectionName,
          documentId:
            event.params.documentId,
          operation:
            getOperation(event),
          eventId: event.id,
          changedAt:
            admin.firestore.FieldValue
                .serverTimestamp(),
        });

        transaction.set(rootRef, {
          schemaVersion: SCHEMA_VERSION,
          version:
            admin.firestore.FieldValue
                .increment(1),
          [versionField]:
            nextVersion,
          [`module_${moduleName}_updatedAt`]:
            admin.firestore.FieldValue
                .serverTimestamp(),
          updatedAt:
            admin.firestore.FieldValue
                .serverTimestamp(),
        }, {merge: true});

        return null;
      },
  );
}

function encodeCallableValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return {
      __incrementalV4Type: "date",
      value: value.getTime(),
    };
  }

  if (
    typeof value?.toMillis === "function" &&
    typeof value?.toDate === "function"
  ) {
    return {
      __incrementalV4Type: "timestamp",
      value: value.toMillis(),
    };
  }

  if (
    Number.isFinite(value?.latitude) &&
    Number.isFinite(value?.longitude)
  ) {
    return {
      __incrementalV4Type: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (
    typeof value?.path === "string" &&
    value?.firestore
  ) {
    return {
      __incrementalV4Type: "reference",
      path: value.path,
    };
  }

  if (Array.isArray(value)) {
    return value.map(encodeCallableValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
        Object.entries(value).map(
            ([key, childValue]) => [
              key,
              encodeCallableValue(childValue),
            ],
        ),
    );
  }

  return null;
}

function getRequestedModule(request) {
  const moduleName =
    String(
        request.data?.moduleName || "",
    );

  if (!MODULE_COLLECTIONS[moduleName]) {
    throw new HttpsError(
        "invalid-argument",
        "Modul incremental tidak dikenal.",
    );
  }

  return moduleName;
}

async function getDocumentsInChunks(references) {
  const snapshots = [];

  for (
    let index = 0;
    index < references.length;
    index += 100
  ) {
    const chunk =
      references.slice(index, index + 100);

    if (chunk.length > 0) {
      snapshots.push(
          ...await db.getAll(...chunk),
      );
    }
  }

  return snapshots;
}

Object.entries(TRIGGER_COLLECTIONS)
    .forEach(
        ([
          functionName,
          collectionName,
        ]) => {
          exports[functionName] =
            onDocumentWritten({
              document:
                `${collectionName}/{documentId}`,
              region: "us-central1",
              memory: "256MiB",
              cpu: "gcf_gen1",
              concurrency: 1,
              timeoutSeconds: 60,
              maxInstances: 10,
            }, (event) =>
              recordIncrementalChange(
                  event,
                  collectionName,
              ));
        },
    );

exports.getIncrementalChangesV4 =
  onCall({
    region: "us-central1",
    memory: "256MiB",
    cpu: "gcf_gen1",
    concurrency: 1,
    timeoutSeconds: 120,
    maxInstances: 10,
  }, async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
          "unauthenticated",
          "Silakan login kembali.",
      );
    }

    const moduleName =
      getRequestedModule(request);

    const sinceVersion =
      Number(request.data?.sinceVersion);

    if (
      !Number.isInteger(sinceVersion) ||
      sinceVersion < 0
    ) {
      throw new HttpsError(
          "invalid-argument",
          "Versi cache incremental tidak valid.",
      );
    }

    const rootRef =
      db.doc(
          `${ROOT_COLLECTION}/${request.auth.uid}`,
      );

    const rootSnapshot =
      await rootRef.get();

    const targetVersion =
      Number(
          rootSnapshot.data()?.[
              `module_${moduleName}_version`
          ],
      ) || 0;

    if (request.data?.metadataOnly === true) {
      return {
        ready: true,
        metadataOnly: true,
        currentVersion: targetVersion,
        changes: [],
      };
    }

    if (sinceVersion > targetVersion) {
      return {
        ready: true,
        requiresFullReload: true,
        reason: "cache-version-ahead",
        currentVersion: targetVersion,
      };
    }

    if (sinceVersion === targetVersion) {
      return {
        ready: true,
        unchanged: true,
        currentVersion: targetVersion,
        changes: [],
      };
    }

    const changesSnapshot =
      await rootRef
          .collection("modules")
          .doc(moduleName)
          .collection("changes")
          .where(
              "version",
              ">",
              sinceVersion,
          )
          .where(
              "version",
              "<=",
              targetVersion,
          )
          .orderBy("version", "asc")
          .limit(
              MAX_CHANGES_PER_REQUEST + 1,
          )
          .get();

    const rawChanges =
      changesSnapshot.docs.map(
          (snapshot) => snapshot.data(),
      );

    const hasTooManyChanges =
      rawChanges.length >
      MAX_CHANGES_PER_REQUEST;

    const journalIsContinuous =
      !hasTooManyChanges &&
      rawChanges.length ===
        targetVersion - sinceVersion &&
      rawChanges.every(
          (change, index) =>
            Number(change.version) ===
            sinceVersion + index + 1,
      );

    if (!journalIsContinuous) {
      return {
        ready: true,
        requiresFullReload: true,
        reason: hasTooManyChanges ?
          "too-many-changes" :
          "journal-gap",
        currentVersion: targetVersion,
      };
    }

    // Jika satu dokumen berubah berkali-kali, hanya kondisi terakhir
    // yang dikirim. Kontinuitas tetap diperiksa dari rawChanges di atas.
    const latestByDocument = new Map();

    rawChanges.forEach((change) => {
      const collectionName =
        String(change.collectionName || "");

      if (
        !MODULE_COLLECTIONS[moduleName]
            .has(collectionName)
      ) {
        return;
      }

      latestByDocument.set(
          `${collectionName}/${change.documentId}`,
          change,
      );
    });

    const compactChanges =
      Array.from(
          latestByDocument.values(),
      );

    const liveChanges =
      compactChanges.filter(
          (change) =>
            change.operation !== "deleted",
      );

    const references =
      liveChanges.map(
          (change) =>
            db.doc(
                `${change.collectionName}/${change.documentId}`,
            ),
      );

    const documentSnapshots =
      await getDocumentsInChunks(references);

    const snapshotByPath =
      new Map(
          documentSnapshots.map(
              (snapshot) => [
                snapshot.ref.path,
                snapshot,
              ],
          ),
      );

    const changes =
      compactChanges.map((change) => {
        const path =
          `${change.collectionName}/${change.documentId}`;

        const currentSnapshot =
          snapshotByPath.get(path);

        if (
          change.operation === "deleted" ||
          !currentSnapshot?.exists
        ) {
          return {
            collectionName:
              change.collectionName,
            documentId:
              change.documentId,
            operation: "deleted",
            version:
              Number(change.version),
            data: null,
          };
        }

        const data =
          currentSnapshot.data() || {};

        // Jurnal milik user tidak boleh membocorkan dokumen yang
        // kemudian dipindahkan ke user lain.
        if (
          data.userId &&
          data.userId !== request.auth.uid
        ) {
          return {
            collectionName:
              change.collectionName,
            documentId:
              change.documentId,
            operation: "deleted",
            version:
              Number(change.version),
            data: null,
          };
        }

        return {
          collectionName:
            change.collectionName,
          documentId:
            change.documentId,
          operation:
            change.operation,
          version:
            Number(change.version),
          data:
            encodeCallableValue(data),
        };
      });

    return {
      ready: true,
      unchanged: changes.length === 0,
      currentVersion: targetVersion,
      eventCount: rawChanges.length,
      documentReadCount:
        references.length,
      changes,
    };
  });
