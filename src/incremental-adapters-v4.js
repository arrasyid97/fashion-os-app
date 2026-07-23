const isActiveRecord = item => {
    if (!item) {
        return false;
    }

    const status =
        String(
            item.status ||
            item.statusData ||
            item.statusProses ||
            ''
        ).toLowerCase();

    return !(
        item.isDeleted === true ||
        item.deleted === true ||
        item.archived === true ||
        item.deletedAt ||
        status === 'deleted' ||
        status === 'dihapus' ||
        status === 'arsip' ||
        status === 'archived'
    );
};

const dateTime = value => {
    if (!value) {
        return 0;
    }

    if (value instanceof Date) {
        return Number.isNaN(
            value.getTime()
        )
            ? 0
            : value.getTime();
    }

    if (
        typeof value?.toDate ===
        'function'
    ) {
        return value.toDate().getTime();
    }

    if (value?.seconds) {
        return Number(value.seconds) *
            1000;
    }

    const parsed =
        new Date(value).getTime();

    return Number.isNaN(parsed)
        ? 0
        : parsed;
};

const normalizeDate = value => {
    const milliseconds =
        dateTime(value);

    return milliseconds > 0
        ? new Date(milliseconds)
        : value || null;
};

const upsertOrDelete =
    (
        rows,
        documentId,
        operation,
        nextValue
    ) => {
        const rowMap =
            new Map(
                (rows || []).map(
                    row => [
                        String(
                            row.id ??
                            row.docId
                        ),
                        row
                    ]
                )
            );

        const key =
            String(documentId);

        if (
            operation === 'deleted' ||
            !nextValue
        ) {
            rowMap.delete(key);
        } else {
            rowMap.set(
                key,
                nextValue
            );
        }

        return Array.from(
            rowMap.values()
        );
    };

const normalizeTransaction =
    change => {
        const data =
            change.data || {};

        return {
            id:
                change.documentId,
            ...data,
            tanggal:
                normalizeDate(
                    data.tanggal
                ),
            tanggalPencairan:
                normalizeDate(
                    data.tanggalPencairan
                )
        };
    };

const normalizeReturn =
    change => {
        const data =
            change.data || {};

        return {
            id:
                change.documentId,
            ...data,
            tanggal:
                normalizeDate(
                    data.tanggal
                )
        };
    };

export const validateSalesPayloadV4 =
    payload =>
        Boolean(
            payload &&
            Array.isArray(
                payload.transactions
            ) &&
            Array.isArray(
                payload.returns
            )
        );

export const mergeSalesChangesV4 =
    (
        originalPayload,
        changes
    ) => {
        let transactions =
            [
                ...originalPayload
                    .transactions
            ];

        let returns =
            [
                ...originalPayload
                    .returns
            ];

        changes.forEach(change => {
            if (
                change.collectionName ===
                'transactions'
            ) {
                const transaction =
                    change.operation ===
                        'deleted'
                        ? null
                        : normalizeTransaction(
                            change
                        );

                transactions =
                    upsertOrDelete(
                        transactions,
                        change.documentId,
                        change.operation,
                        isActiveRecord(
                            transaction
                        )
                            ? transaction
                            : null
                    );
            }

            if (
                change.collectionName ===
                'returns'
            ) {
                const returnRow =
                    change.operation ===
                        'deleted'
                        ? null
                        : normalizeReturn(
                            change
                        );

                returns =
                    upsertOrDelete(
                        returns,
                        change.documentId,
                        change.operation,
                        isActiveRecord(
                            returnRow
                        )
                            ? returnRow
                            : null
                    );
            }
        });

        transactions.sort(
            (left, right) =>
                dateTime(
                    right.tanggal
                ) -
                dateTime(
                    left.tanggal
                )
        );

        returns.sort(
            (left, right) =>
                dateTime(
                    right.tanggal
                ) -
                dateTime(
                    left.tanggal
                )
        );

        return {
            transactions,
            returns
        };
    };

const normalizeProduct =
    change => {
        const data =
            change.data || {};

        return {
            docId:
                change.documentId,
            sku: data.sku || '',
            nama:
                data.product_name || '',
            model_id:
                data.model_id || '',
            warna:
                data.color || '',
            varian:
                data.variant || '',
            stokFisik:
                Number(
                    data.physical_stock
                ) || 0,
            hpp:
                Number(data.hpp) || 0,
            hargaJual: {},
            stokAlokasi: {},
            userId: data.userId
        };
    };

const normalizeRawDocument =
    change => ({
        id: change.documentId,
        ...(change.data || {})
    });

export const validateProductsPayloadV4 =
    payload =>
        Boolean(
            payload &&
            Array.isArray(
                payload.products
            ) &&
            Array.isArray(
                payload.productPrices
            ) &&
            Array.isArray(
                payload.stockAllocations
            )
        );

export const mergeProductChangesV4 =
    (
        originalPayload,
        changes
    ) => {
        let products =
            [
                ...originalPayload.products
            ];

        let productPrices =
            [
                ...originalPayload
                    .productPrices
            ];

        let stockAllocations =
            [
                ...originalPayload
                    .stockAllocations
            ];

        changes.forEach(change => {
            if (
                change.collectionName ===
                'products'
            ) {
                products =
                    upsertOrDelete(
                        products,
                        change.documentId,
                        change.operation,
                        change.operation ===
                            'deleted'
                            ? null
                            : normalizeProduct(
                                change
                            )
                    );
            }

            if (
                change.collectionName ===
                'product_prices'
            ) {
                productPrices =
                    upsertOrDelete(
                        productPrices,
                        change.documentId,
                        change.operation,
                        change.operation ===
                            'deleted'
                            ? null
                            : normalizeRawDocument(
                                change
                            )
                    );
            }

            if (
                change.collectionName ===
                'stock_allocations'
            ) {
                stockAllocations =
                    upsertOrDelete(
                        stockAllocations,
                        change.documentId,
                        change.operation,
                        change.operation ===
                            'deleted'
                            ? null
                            : normalizeRawDocument(
                                change
                            )
                    );
            }
        });

        products.sort(
            (left, right) =>
                String(
                    left.nama || ''
                ).localeCompare(
                    String(
                        right.nama || ''
                    ),
                    'id-ID',
                    {
                        sensitivity: 'base'
                    }
                )
        );

        return {
            products,
            productPrices,
            stockAllocations,
            visibleCount:
                Number(
                    originalPayload
                        .visibleCount
                ) || 100
        };
    };

export const validateFinancePayloadV4 =
    payload =>
        Boolean(
            payload &&
            Array.isArray(payload.rows)
        );

export const mergeFinanceChangesV4 =
    (
        originalPayload,
        changes
    ) => {
        let rows =
            [...originalPayload.rows];

        changes.forEach(change => {
            if (
                change.collectionName !==
                'keuangan'
            ) {
                return;
            }

            const data =
                change.data || {};

            const nextValue =
                change.operation ===
                    'deleted'
                    ? null
                    : {
                        id:
                            change.documentId,
                        ...data,
                        tanggal:
                            normalizeDate(
                                data.tanggal
                            )
                    };

            rows =
                upsertOrDelete(
                    rows,
                    change.documentId,
                    change.operation,
                    isActiveRecord(nextValue)
                        ? nextValue
                        : null
                );
        });

        rows.sort(
            (left, right) => {
                const dateDifference =
                    dateTime(left.tanggal) -
                    dateTime(right.tanggal);

                if (dateDifference !== 0) {
                    return dateDifference;
                }

                return String(
                    left.id || ''
                ).localeCompare(
                    String(
                        right.id || ''
                    )
                );
            }
        );

        return { rows };
    };

export const filterRowsByRangeV4 =
    (
        rows,
        range
    ) =>
        (rows || []).filter(row => {
            if (range?.allTime) {
                return true;
            }

            const value =
                dateTime(row.tanggal);

            const start =
                range?.startDate
                    ? range.startDate
                        .getTime()
                    : Number.NEGATIVE_INFINITY;

            const end =
                range?.endDate
                    ? range.endDate
                        .getTime()
                    : Number.POSITIVE_INFINITY;

            return (
                value >= start &&
                value <= end
            );
        });
