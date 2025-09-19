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
        // --- AWAL PERBAIKAN ---
        // 1. Pengecekan header Authorization yang lebih aman
        const { authorization } = request.headers;
        if (!authorization || !authorization.startsWith('Bearer ')) {
            return response.status(401).json({ message: 'Unauthorized: Token tidak ditemukan.' });
        }
        const idToken = authorization.split('Bearer ')[1];
        // --- AKHIR PERBAIKAN ---

        const decodedToken = await auth.verifyIdToken(idToken);
        if (decodedToken.uid !== '6m4bgRlZMDhL8niVyD4lZmGuarF3') { // Ganti dengan ADMIN_UID Anda
            return response.status(403).json({ message: 'Hanya admin yang bisa melakukan aksi ini.' });
        }

        const { withdrawalId } = request.body;
        const q = db.collection('commissions').where('withdrawalId', '==', withdrawalId).where('status', '==', 'processing');
        const snapshot = await q.get();

        if (snapshot.empty) {
            throw new Error('Tidak ada pencairan yang cocok untuk dikonfirmasi.');
        }

        const batch = db.batch();
        let totalAmount = 0;
        let partnerRef = '';
        let partnerEmail = ''; // Tambahkan ini untuk catatan

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            totalAmount += data.commissionAmount;
            partnerRef = data.referralCode || 'N/A'; // Ambil dari data komisi
            partnerEmail = data.referredUserEmail || 'N/A'; // Ambil dari data komisi
            batch.update(doc.ref, { status: 'paid' });
        });

        const expenseData = {
            withdrawalId: withdrawalId,
            kategori: 'Pembayaran Komisi Mitra',
            jumlah: totalAmount,
            catatan: `Pembayaran dikonfirmasi untuk: ${partnerEmail} | ID: ${withdrawalId}`,
            jenis: 'pengeluaran',
            userId: '6m4bgRlZMDhL8niVyD4lZmGuarF3', // ADMIN_UID
            tanggal: new Date()
        };
        const keuanganRef = db.collection('keuangan').doc();
        batch.set(keuanganRef, expenseData);

        await batch.commit();
        return response.status(200).json({ message: 'Pembayaran berhasil dikonfirmasi.' });

    } catch (error) {
        // --- LOGGING ERROR LEBIH DETAIL ---
        console.error('FATAL ERROR di confirm-payment:', error);
        return response.status(500).json({ message: `Terjadi kesalahan di server: ${error.message}` });
    }
}