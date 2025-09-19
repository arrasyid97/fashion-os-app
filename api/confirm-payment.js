const admin = require('firebase-admin');
if (!admin.apps.length) { /* ... (Inisialisasi Firebase) ... */ }
const db = admin.firestore();
const auth = admin.auth();

export default async function handler(request, response) {
    try {
        // Verifikasi token admin
        const idToken = request.headers.authorization.split('Bearer ')[1];
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

        snapshot.docs.forEach(doc => {
            totalAmount += doc.data().commissionAmount;
            partnerRef = doc.data().partnerEmail;
            batch.update(doc.ref, { status: 'paid' });
        });

        const expenseData = {
            withdrawalId: withdrawalId,
            kategori: 'Pembayaran Komisi Mitra',
            jumlah: totalAmount,
            catatan: `Pembayaran dikonfirmasi untuk: ${partnerRef} | ID: ${withdrawalId}`,
            jenis: 'pengeluaran',
            userId: '6m4bgRlZMDhL8niVyD4lZmGuarF3', // ADMIN_UID
            tanggal: new Date()
        };
        const keuanganRef = db.collection('keuangan').doc();
        batch.set(keuanganRef, expenseData);

        await batch.commit();
        return response.status(200).json({ message: 'Pembayaran berhasil dikonfirmasi.' });

    } catch (error) {
        return response.status(500).json({ message: error.message });
    }
}