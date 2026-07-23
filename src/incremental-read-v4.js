import { httpsCallable } from 'firebase/functions';

import {
    readModuleCacheSnapshot,
    writeIncrementalModuleCache,
} from './app-read-cache.js';

const DIRTY_RETRY_DELAYS =
    Object.freeze([
        300,
        700,
        1200,
        2000,
        3200,
        5000,
    ]);

const activeSyncRequests =
    new Map();

const wait =
    milliseconds =>
        new Promise(resolve => {
            window.setTimeout(
                resolve,
                milliseconds
            );
        });

const decodeServerValue = value => {
    if (
        value === null ||
        value === undefined
    ) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(
            decodeServerValue
        );
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (
        value.__incrementalV4Type ===
            'timestamp' ||
        value.__incrementalV4Type ===
            'date'
    ) {
        const decoded =
            new Date(
                Number(value.value)
            );

        return Number.isNaN(
            decoded.getTime()
        )
            ? null
            : decoded;
    }

    if (
        value.__incrementalV4Type ===
        'geopoint'
    ) {
        return {
            latitude:
                Number(value.latitude),
            longitude:
                Number(value.longitude)
        };
    }

    if (
        value.__incrementalV4Type ===
        'reference'
    ) {
        return {
            path:
                String(value.path || '')
        };
    }

    return Object.fromEntries(
        Object.entries(value).map(
            ([key, childValue]) => [
                key,
                decodeServerValue(
                    childValue
                )
            ]
        )
    );
};

const normalizeResponse =
    response => {
        const data =
            response?.data || {};

        return {
            ...data,
            currentVersion:
                Number(
                    data.currentVersion
                ) || 0,
            eventCount:
                Number(
                    data.eventCount
                ) || 0,
            documentReadCount:
                Number(
                    data.documentReadCount
                ) || 0,
            changes:
                Array.isArray(data.changes)
                    ? data.changes.map(
                        change => ({
                            ...change,
                            data:
                                decodeServerValue(
                                    change.data
                                )
                        })
                    )
                    : []
        };
    };

const requestChanges = async (
    firebaseFunctions,
    moduleName,
    sinceVersion,
    metadataOnly = false
) => {
    const callable =
        httpsCallable(
            firebaseFunctions,
            'getIncrementalChangesV4'
        );

    return normalizeResponse(
        await callable({
            moduleName,
            sinceVersion,
            metadataOnly
        })
    );
};

const requestChangesWithDirtyWait =
    async ({
        firebaseFunctions,
        moduleName,
        sinceVersion,
        dirty
    }) => {
        let response =
            await requestChanges(
                firebaseFunctions,
                moduleName,
                sinceVersion
            );

        if (!dirty) {
            return response;
        }

        for (
            let index = 0;
            response.unchanged === true &&
            index <
                DIRTY_RETRY_DELAYS.length;
            index += 1
        ) {
            await wait(
                DIRTY_RETRY_DELAYS[index]
            );

            response =
                await requestChanges(
                    firebaseFunctions,
                    moduleName,
                    sinceVersion
                );
        }

        return response;
    };

const runIncrementalModuleSyncV4 =
    async ({
        firebaseFunctions,
        moduleName,
        cacheKey,
        validatePayload,
        mergeChanges
    }) => {
        const snapshot =
            await readModuleCacheSnapshot(
                moduleName,
                cacheKey
            );

        const hasValidSnapshot =
            Boolean(
                snapshot &&
                validatePayload(
                    snapshot.payload
                )
            );

        const sinceVersion =
            Number.isInteger(
                snapshot
                    ?.incrementalVersion
            )
                ? snapshot
                    .incrementalVersion
                : 0;

        const isLegacySnapshot =
            snapshot
                ?.incrementalVersion ===
                null;

        const response =
            !hasValidSnapshot ||
            isLegacySnapshot
                ? await requestChanges(
                    firebaseFunctions,
                    moduleName,
                    0,
                    true
                )
                : await requestChangesWithDirtyWait({
                    firebaseFunctions,
                    moduleName,
                    sinceVersion,
                    dirty:
                        snapshot?.dirty ===
                        true
                });

        if (
            !hasValidSnapshot ||
            response
                .requiresFullReload ===
                true
        ) {
            return {
                status: 'full-required',
                baselineVersion:
                    response.currentVersion,
                reason:
                    response.reason ||
                    'cache-missing'
            };
        }

        // Cache V3 boleh menjadi dasar versi 0 hanya jika versinya
        // masih cocok dan tidak ada write lokal yang menunggu trigger.
        if (
            snapshot
                .incrementalVersion ===
                null &&
            (
                response.currentVersion !==
                    0 ||
                snapshot.v3VersionMatches !==
                    true ||
                snapshot.dirty === true
            )
        ) {
            return {
                status: 'full-required',
                baselineVersion:
                    response.currentVersion,
                reason:
                    'legacy-cache-needs-baseline'
            };
        }

        if (
            snapshot.dirty === true &&
            response.unchanged === true
        ) {
            return {
                status: 'full-required',
                baselineVersion:
                    response.currentVersion,
                reason:
                    'trigger-not-visible-yet'
            };
        }

        const payload =
            response.changes.length > 0
                ? mergeChanges(
                    snapshot.payload,
                    response.changes
                )
                : snapshot.payload;

        if (!validatePayload(payload)) {
            return {
                status: 'full-required',
                baselineVersion:
                    response.currentVersion,
                reason:
                    'merge-invalid'
            };
        }

        await writeIncrementalModuleCache(
            moduleName,
            cacheKey,
            payload,
            response.currentVersion
        );

        return {
            status:
                response.changes.length > 0
                    ? 'incremental'
                    : 'cache',
            payload,
            version:
                response.currentVersion,
            eventCount:
                response.eventCount,
            documentReadCount:
                response.documentReadCount
        };
    };

export const syncIncrementalModuleV4 =
    options => {
        const requestKey =
            `${options.moduleName}::${options.cacheKey}`;

        if (
            activeSyncRequests.has(
                requestKey
            )
        ) {
            return activeSyncRequests.get(
                requestKey
            );
        }

        const request =
            runIncrementalModuleSyncV4(
                options
            ).finally(() => {
                activeSyncRequests.delete(
                    requestKey
                );
            });

        activeSyncRequests.set(
            requestKey,
            request
        );

        return request;
    };

export const finalizeFullReloadV4 =
    async ({
        firebaseFunctions,
        moduleName,
        cacheKey,
        payload,
        baselineVersion,
        validatePayload,
        mergeChanges
    }) => {
        if (!validatePayload(payload)) {
            return {
                payload,
                cached: false
            };
        }

        try {
            const response =
                await requestChanges(
                    firebaseFunctions,
                    moduleName,
                    Number(
                        baselineVersion
                    ) || 0
                );

            if (
                response
                    .requiresFullReload ===
                    true
            ) {
                return {
                    payload,
                    cached: false,
                    reason:
                        response.reason
                };
            }

            const finalPayload =
                response.changes.length > 0
                    ? mergeChanges(
                        payload,
                        response.changes
                    )
                    : payload;

            if (
                !validatePayload(
                    finalPayload
                )
            ) {
                return {
                    payload,
                    cached: false,
                    reason:
                        'final-merge-invalid'
                };
            }

            await writeIncrementalModuleCache(
                moduleName,
                cacheKey,
                finalPayload,
                response.currentVersion
            );

            return {
                payload: finalPayload,
                cached: true,
                version:
                    response.currentVersion
            };
        } catch (error) {
            console.warn(
                `[INCREMENTAL V4] Baseline ${moduleName} belum dapat diberi versi. Data server tetap dipakai.`,
                error
            );

            return {
                payload,
                cached: false,
                error
            };
        }
    };
