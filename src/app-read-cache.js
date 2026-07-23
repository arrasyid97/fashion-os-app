const CACHE_DB_NAME = 'fashion_os_app_read_cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'module_payloads';
const CACHE_SCHEMA_VERSION = 1;

let databasePromise = null;
let activeUserId = null;
let activeVersions = {};
let cacheEnabled = false;

const dirtyStorageKey = (userId, moduleName) =>
    `fashion_os_cache_dirty_v1_${userId}_${moduleName}`;

const cacheRecordId = (userId, moduleName, cacheKey) =>
    `${userId}::${moduleName}::${cacheKey}`;

const openCacheDatabase = () => {
    if (databasePromise) {
        return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
        if (
            typeof window === 'undefined' ||
            !window.indexedDB
        ) {
            reject(
                new Error(
                    'IndexedDB tidak tersedia.'
                )
            );
            return;
        }

        const request = window.indexedDB.open(
            CACHE_DB_NAME,
            CACHE_DB_VERSION
        );

        request.onupgradeneeded = () => {
            const database = request.result;

            if (
                !database.objectStoreNames.contains(
                    CACHE_STORE_NAME
                )
            ) {
                database.createObjectStore(
                    CACHE_STORE_NAME,
                    { keyPath: 'id' }
                );
            }
        };

        request.onsuccess = () => {
            const database = request.result;

            database.onversionchange = () => {
                database.close();
                databasePromise = null;
            };

            resolve(database);
        };

        request.onerror = () => {
            databasePromise = null;
            reject(
                request.error ||
                new Error(
                    'Database cache gagal dibuka.'
                )
            );
        };
    });

    return databasePromise;
};

const runStoreRequest = async (
    mode,
    executeRequest
) => {
    const database = await openCacheDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            CACHE_STORE_NAME,
            mode
        );

        const store = transaction.objectStore(
            CACHE_STORE_NAME
        );

        const request = executeRequest(store);
        let requestResult;

        request.onsuccess = () => {
            requestResult = request.result;

            if (mode === 'readonly') {
                resolve(requestResult);
            }
        };

        request.onerror = () => {
            reject(
                request.error ||
                new Error(
                    'Operasi cache gagal.'
                )
            );
        };

        transaction.oncomplete = () => {
            if (mode !== 'readonly') {
                resolve(requestResult);
            }
        };

        transaction.onerror = () => {
            reject(
                transaction.error ||
                new Error(
                    'Transaksi cache gagal.'
                )
            );
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error(
                    'Transaksi cache dibatalkan.'
                )
            );
        };
    });
};

const encodeCacheValue = value => {
    if (value === undefined) {
        return {
            __fashionCacheType: 'undefined'
        };
    }

    if (value === null) {
        return null;
    }

    if (value instanceof Date) {
        return {
            __fashionCacheType: 'date',
            value: value.toISOString()
        };
    }

    if (
        typeof value?.toMillis === 'function' &&
        typeof value?.toDate === 'function'
    ) {
        return {
            __fashionCacheType: 'timestamp',
            value: value.toMillis()
        };
    }

    if (Array.isArray(value)) {
        return value.map(encodeCacheValue);
    }

    if (typeof value === 'object') {
        const encodedObject = {};

        Object.entries(value).forEach(
            ([key, itemValue]) => {
                if (
                    typeof itemValue === 'function'
                ) {
                    return;
                }

                encodedObject[key] =
                    encodeCacheValue(itemValue);
            }
        );

        return encodedObject;
    }

    if (
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    return null;
};

const decodeCacheValue = value => {
    if (value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map(decodeCacheValue);
    }

    if (typeof value === 'object') {
        if (
            value.__fashionCacheType ===
            'undefined'
        ) {
            return undefined;
        }

        if (
            value.__fashionCacheType ===
                'date' ||
            value.__fashionCacheType ===
                'timestamp'
        ) {
            const decodedDate =
                value.__fashionCacheType ===
                    'timestamp'
                    ? new Date(
                        Number(value.value)
                    )
                    : new Date(value.value);

            return Number.isNaN(
                decodedDate.getTime()
            )
                ? null
                : decodedDate;
        }

        const decodedObject = {};

        Object.entries(value).forEach(
            ([key, itemValue]) => {
                decodedObject[key] =
                    decodeCacheValue(itemValue);
            }
        );

        return decodedObject;
    }

    return value;
};

const getModuleVersion = moduleName =>
    Number(activeVersions[moduleName]) || 0;

export const setReadCacheContext = (
    userId,
    versions = {}
) => {
    activeUserId = userId || null;
    activeVersions = {
        ...versions
    };
    cacheEnabled = Boolean(activeUserId);
};

export const clearReadCacheContext = () => {
    activeUserId = null;
    activeVersions = {};
    cacheEnabled = false;
};

export const readModuleCache = async (
    moduleName,
    cacheKey
) => {
    if (
        !cacheEnabled ||
        !activeUserId ||
        !moduleName ||
        !cacheKey
    ) {
        return null;
    }

    if (
        localStorage.getItem(
            dirtyStorageKey(
                activeUserId,
                moduleName
            )
        ) === '1'
    ) {
        return null;
    }

    try {
        const record = await runStoreRequest(
            'readonly',
            store => store.get(
                cacheRecordId(
                    activeUserId,
                    moduleName,
                    cacheKey
                )
            )
        );

        if (
            !record ||
            record.schemaVersion !==
                CACHE_SCHEMA_VERSION ||
            Number(record.moduleVersion) !==
                getModuleVersion(moduleName) ||
            typeof record.payload !== 'string'
        ) {
            return null;
        }

        return decodeCacheValue(
            JSON.parse(record.payload)
        );
    } catch (error) {
        console.warn(
            `[APP CACHE] Cache ${moduleName}/${cacheKey} tidak dapat dibaca.`,
            error
        );

        return null;
    }
};

export const writeModuleCache = async (
    moduleName,
    cacheKey,
    payload
) => {
    if (
        !cacheEnabled ||
        !activeUserId ||
        !moduleName ||
        !cacheKey
    ) {
        return false;
    }

    try {
        const record = {
            id: cacheRecordId(
                activeUserId,
                moduleName,
                cacheKey
            ),
            userId: activeUserId,
            moduleName,
            cacheKey,
            schemaVersion:
                CACHE_SCHEMA_VERSION,
            moduleVersion:
                getModuleVersion(moduleName),
            savedAt: Date.now(),
            payload: JSON.stringify(
                encodeCacheValue(payload)
            )
        };

        await runStoreRequest(
            'readwrite',
            store => store.put(record)
        );

        localStorage.removeItem(
            dirtyStorageKey(
                activeUserId,
                moduleName
            )
        );

        return true;
    } catch (error) {
        console.warn(
            `[APP CACHE] Cache ${moduleName}/${cacheKey} tidak dapat disimpan.`,
            error
        );

        return false;
    }
};

export const invalidateModuleCache =
    moduleName => {
        if (
            !activeUserId ||
            !moduleName
        ) {
            return;
        }

        // localStorage bersifat sinkron. Jika halaman langsung
        // direfresh sesudah write, cache lama tetap ditolak.
        localStorage.setItem(
            dirtyStorageKey(
                activeUserId,
                moduleName
            ),
            '1'
        );
    };

export const isReadCacheReady = () =>
    cacheEnabled && Boolean(activeUserId);
