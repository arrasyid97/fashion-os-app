const admin = require('firebase-admin');

// Inisialisasi Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
    });
}

const db = admin.firestore();
const auth = admin.auth();

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { authorization } = request.headers;
        if (!authorization || !authorization.startsWith('Bearer ')) {
            return response.status(401).json({ message: 'Unauthorized: No token provided.' });
        }

        const idToken = authorization.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const partnerUid = decodedToken.uid;

        const { amountToWithdraw, withdrawalId, referralCode } = request.body;
        if (!amountToWithdraw || !withdrawalId || !referralCode) {
            return response.status(400).json({ message: 'Missing required data.' });
        }

        const commissionsQuery = db.collection('commissions')
            .where('partnerId', '==', partnerUid)
            .where('status', '==', 'unpaid');
            
        const snapshot = await commissionsQuery.get();
        if (snapshot.empty) {
            throw new Error('No unpaid commissions found to process.');
        }

        const batch = db.batch();
        const now = new Date();

        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { status: 'paid', paidDate: now });
        });

        const expenseData = {
            kategori: 'Pembayaran Komisi Mitra',
            jumlah: amountToWithdraw,
            catatan: `ID Pencairan: ${withdrawalId} | Mitra: ${referralCode}`,
            jenis: 'pengeluaran',
            userId: '6m4bgRlZMDhL8niVyD4lZmGuarF3', // ADMIN_UID
            tanggal: now
        };
        const keuanganRef = db.collection('keuangan').doc();
        batch.set(keuanganRef, expenseData);

        await batch.commit();

        return response.status(200).json({ message: 'Cashout request processed successfully.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses cashout:', error);
        return response.status(500).json({ message: 'Failed to process cashout request', error: error.message });
    }
}