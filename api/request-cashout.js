import { Resend } from 'resend';
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
const resend = new Resend(process.env.RESEND_API_KEY);

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
        const partnerEmail = decodedToken.email;

        const { amountToWithdraw, withdrawalId, referralCode } = request.body;
        if (!amountToWithdraw || !withdrawalId || !referralCode) {
            return response.status(400).json({ message: 'Missing required data.' });
        }

        // ... (Kode untuk query komisi tetap sama) ...
        const commissionsQuery = db.collection('commissions').where('partnerId', '==', partnerUid).where('status', '==', 'unpaid');
        const snapshot = await commissionsQuery.get();
        if (snapshot.empty) {
            throw new Error('No unpaid commissions found to process.');
        }
        // ... (Kode batch write tetap sama) ...
        const batch = db.batch();
        const now = new Date();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { status: 'paid', paidDate: now });
        });
        const expenseData = {
            withdrawalId: withdrawalId,
            kategori: 'Pembayaran Komisi Mitra',
            jumlah: amountToWithdraw,
            catatan: `ID Pencairan: ${withdrawalId} | Mitra: ${referralCode}`,
            jenis: 'pengeluaran',
            userId: '6m4bgRlZMDhL8niVyD4lZmGuarF3',
            tanggal: now
        };
        const keuanganRef = db.collection('keuangan').doc();
        batch.set(keuanganRef, expenseData);
        await batch.commit();

        // --- LOGIKA BARU: KIRIM EMAIL KE ADMIN ---
        await resend.emails.send({
            from: 'sistem@appfashion.id', // Ganti dengan email dari domain terverifikasi Anda
            to: 'fashion234oss@gmail.com', // Ganti dengan email admin Anda
            subject: `Pengajuan Pencairan Komisi Baru: ${referralCode}`,
            html: `
                <p>Halo Admin,</p>
                <p>Ada pengajuan pencairan komisi baru dari mitra dengan detail sebagai berikut:</p>
                <ul>
                    <li><strong>ID Pencairan:</strong> <code>${withdrawalId}</code></li>
                    <li><strong>Kode Mitra:</strong> ${referralCode}</li>
                    <li><strong>Email Mitra:</strong> ${partnerEmail}</li>
                    <li><strong>Jumlah:</strong> Rp ${amountToWithdraw.toLocaleString('id-ID')}</li>
                </ul>
                <p>Silakan verifikasi menggunakan ID Pencairan di panel admin Anda sebelum melakukan transfer.</p>
            `
        });

        return response.status(200).json({ message: 'Cashout request processed and email sent.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses cashout:', error);
        return response.status(500).json({ message: 'Failed to process cashout request', error: error.message });
    }
}