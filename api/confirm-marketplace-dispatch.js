const admin = require('firebase-admin');
const { confirmDispatchBatch, inspectDispatchOrders } = require('../server/marketplace-dispatch.cjs');
const { prepareOrderDeletion, deleteMarketplaceOrder } = require('../server/marketplace-order-delete.cjs');
const { returnSearchIndex, returnSearchTransaction } = require('../server/return-search.cjs');
function getApp() {
    const name = 'marketplace-dispatch';
    const existing = admin.apps.find(app => app.name === name);
    if (existing) return existing;
    const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    };
    return admin.initializeApp({ credential: admin.credential.cert(credentials) }, name);
}
module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ message: 'Gunakan konfirmasi pengiriman dari aplikasi.' }); }
    try {
        const token = String(request.headers.authorization || '').match(/^Bearer (.+)$/);
        if (!token) return response.status(401).json({ message: 'Silakan masuk kembali sebelum mengonfirmasi pengiriman.' });
        const app = getApp();
        let user;
        try { user = await app.auth().verifyIdToken(token[1]); } catch (_) { return response.status(401).json({ message: 'Sesi berakhir. Silakan masuk kembali.' }); }
        const actions = { check: inspectDispatchOrders, confirm: confirmDispatchBatch, prepare_delete: prepareOrderDeletion, delete: deleteMarketplaceOrder, return_index: returnSearchIndex, return_transaction: returnSearchTransaction };
        if (!Object.hasOwn(actions, request.body?.action)) return response.status(400).json({ message: 'Tindakan tidak valid.' });
        const action = actions[request.body.action];
        const result = await action({ db: app.firestore(), userId: user.uid, input: request.body });
        return response.status(200).json(result);
    } catch (error) {
        if (!error.status) console.error('Marketplace dispatch failed:', error.code || error.message);
        return response.status(error.status || 500).json({ message: error.status ? error.message : 'Konfirmasi belum berhasil. Coba lagi; pesanan yang sudah tercatat tidak akan mengurangi stok dua kali.', code: error.code || 'dispatch_failed', ...(error.shortages ? { shortages: error.shortages } : {}), ...(error.orderId ? { orderId: error.orderId } : {}) });
    }
};
