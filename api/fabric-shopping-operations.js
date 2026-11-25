const admin = require('firebase-admin');
const { listOperations, settleOperations, cancelOperationsPayment } = require('../server/fabric-shopping-operations.cjs');

function getApp() {
    const name = 'fabric-shopping-operations';
    const existing = admin.apps.find(app => app.name === name);
    if (existing) return existing;
    const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS ? JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS) : {
        projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    };
    return admin.initializeApp({ credential: admin.credential.cert(credentials) }, name);
}

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return response.status(405).json({ message: 'Gunakan pencatatan operasional dari Gudang Kain.' }); }
    try {
        const token = String(request.headers.authorization || '').match(/^Bearer (.+)$/);
        if (!token) return response.status(401).json({ message: 'Silakan masuk kembali.' });
        const app = getApp();
        let user;
        try { user = await app.auth().verifyIdToken(token[1]); } catch (_) { return response.status(401).json({ message: 'Sesi berakhir. Silakan masuk kembali.' }); }
        const action = request.body?.action;
        if (!['list', 'pay', 'legacy_paid', 'mark_unpaid', 'reopen_legacy', 'cancel_payment'].includes(action)) return response.status(400).json({ message: 'Tindakan tidak valid.' });
        const operation = action === 'list' ? listOperations : action === 'cancel_payment' ? cancelOperationsPayment : settleOperations;
        const result = await operation({ db: app.firestore(), userId: user.uid, input: request.body });
        return response.status(200).json(result);
    } catch (error) {
        if (!error.status) console.error('Fabric shopping operations failed:', error.code || error.message);
        return response.status(error.status || 500).json({ message: error.status ? error.message : 'Pencatatan belum berhasil. Muat ulang status sebelum mencoba lagi agar tidak tercatat dua kali.' });
    }
};
