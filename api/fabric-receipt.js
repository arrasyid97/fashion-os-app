const admin = require('firebase-admin');

// Each binary chunk fits in a Firestore document and a Vercel response.
// Receipt bytes are stored once; all stock colors reference the same receipt ID.
const CHUNK_SIZE = 512 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'application/pdf']);

function getApp() {
    const name = 'fabric-receipts';
    const existing = admin.apps.find(app => app.name === name);
    if (existing) return existing;
    let credentials;
    if (process.env.FIREBASE_ADMIN_CREDENTIALS) {
        credentials = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
    } else {
        credentials = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
        };
    }
    return admin.initializeApp({ credential: admin.credential.cert(credentials) }, name);
}

function fail(status, message) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

async function getOwnedStocks(db, ids, userId, purchaseId) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 200 ||
        new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
        fail(400, 'Daftar stok kain tidak valid.');
    }
    const docs = await db.getAll(...ids.map(id => db.collection('fabric_stock').doc(id)));
    for (const doc of docs) {
        const data = doc.data();
        if (!doc.exists || data.userId !== userId || (data.purchaseId || doc.id) !== purchaseId) {
            fail(403, 'Grup pembelian tidak ditemukan atau bukan milik akun ini.');
        }
    }
    return docs;
}

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['POST', 'GET'].includes(request.method)) {
        response.setHeader('Allow', 'POST, GET');
        return response.status(405).json({ message: 'Metode tidak didukung.' });
    }
    try {
        const match = String(request.headers.authorization || '').match(/^Bearer (.+)$/);
        if (!match) fail(401, 'Silakan masuk untuk mengakses nota.');
        const app = getApp();
        let user;
        try { user = await app.auth().verifyIdToken(match[1]); } catch (_) {
            fail(401, 'Sesi berakhir. Silakan masuk kembali.');
        }
        const db = app.firestore();
        if (request.method === 'POST' && request.body?.action === 'begin') {
            const { stockIds, purchaseId, name, contentType, size } = request.body;
            if (typeof purchaseId !== 'string' || !purchaseId || !ALLOWED_TYPES.has(contentType) ||
                !Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE ||
                typeof name !== 'string' || !name.trim() || name.length > 240) {
                fail(400, 'Nota harus berupa foto atau PDF dengan ukuran maksimal 10 MB.');
            }
            await getOwnedStocks(db, stockIds, user.uid, purchaseId);
            const ref = db.collection('fabric_receipts').doc();
            await ref.set({
                userId: user.uid, purchaseId, stockIds, name, contentType, size,
                chunkCount: Math.ceil(size / CHUNK_SIZE), status: 'uploading',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return response.status(200).json({ receiptId: ref.id, chunkSize: CHUNK_SIZE });
        }

        const receiptId = request.method === 'GET' ? request.query.receiptId : request.body?.receiptId;
        if (typeof receiptId !== 'string' || !/^[a-zA-Z0-9]{20}$/.test(receiptId)) fail(400, 'ID nota tidak valid.');
        const receiptRef = db.collection('fabric_receipts').doc(receiptId);
        const snap = await receiptRef.get();
        const receipt = snap.data();
        if (!snap.exists || receipt.userId !== user.uid) fail(404, 'Nota tidak ditemukan.');

        if (request.method === 'GET') {
            if (receipt.status !== 'attached') fail(409, 'Nota belum selesai disimpan.');
            const index = Number(request.query.index);
            if (!Number.isInteger(index) || index < 0 || index >= receipt.chunkCount) fail(400, 'Bagian nota tidak valid.');
            const chunk = await receiptRef.collection('chunks').doc(String(index)).get();
            if (!chunk.exists) fail(404, 'Bagian nota tidak ditemukan.');
            response.setHeader('Content-Type', 'application/octet-stream');
            return response.status(200).send(Buffer.from(chunk.data().bytes));
        }

        if (request.body?.action === 'chunk') {
            if (receipt.status !== 'uploading') fail(409, 'Nota sudah selesai disimpan.');
            const { index, data } = request.body;
            if (!Number.isInteger(index) || index < 0 || index >= receipt.chunkCount ||
                typeof data !== 'string' || data.length > Math.ceil(CHUNK_SIZE / 3) * 4 ||
                !/^[a-zA-Z0-9+/]*={0,2}$/.test(data)) fail(400, 'Bagian nota tidak valid.');
            const bytes = Buffer.from(data, 'base64');
            const expectedSize = index === receipt.chunkCount - 1 ? receipt.size - index * CHUNK_SIZE : CHUNK_SIZE;
            if (bytes.length !== expectedSize) fail(400, 'Ukuran bagian nota tidak sesuai.');
            await receiptRef.collection('chunks').doc(String(index)).set({ bytes });
            return response.status(200).json({ received: index });
        }

        if (request.body?.action === 'finish') {
            if (receipt.status !== 'attached') {
                const chunks = await receiptRef.collection('chunks').get();
                if (chunks.size !== receipt.chunkCount) fail(409, 'Nota belum lengkap. Silakan unggah ulang.');
                const stocks = await getOwnedStocks(db, receipt.stockIds, user.uid, receipt.purchaseId);
                const fields = {
                    notaReceiptId: receiptId, notaNama: receipt.name, notaContentType: receipt.contentType,
                    notaChunkCount: receipt.chunkCount, notaSize: receipt.size,
                    notaUrl: '', notaPath: '', receiptStatus: 'attached', receiptError: ''
                };
                const batch = db.batch();
                stocks.forEach(stock => batch.update(stock.ref, fields));
                batch.update(receiptRef, { status: 'attached', attachedAt: admin.firestore.FieldValue.serverTimestamp() });
                await batch.commit();
            }
            return response.status(200).json({
                notaReceiptId: receiptId, notaNama: receipt.name, notaContentType: receipt.contentType,
                notaChunkCount: receipt.chunkCount, notaSize: receipt.size,
                notaUrl: '', notaPath: '', receiptStatus: 'attached', receiptError: ''
            });
        }
        fail(400, 'Permintaan nota tidak valid.');
    } catch (error) {
        if (!error.status) console.error('Fabric receipt request failed:', error.code || error.message);
        return response.status(error.status || 500).json({
            message: error.status ? error.message : 'Nota belum berhasil disimpan. Silakan coba lagi.'
        });
    }
};
