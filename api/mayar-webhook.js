const admin = require('firebase-admin');

// Inisialisasi Firebase Admin SDK (hanya jika belum ada)
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

/**
 * Menangani webhook dari Mayar untuk pembayaran yang berhasil.
 * @param {import('http').IncomingMessage} request - Objek request.
 * @param {import('http').ServerResponse} response - Objek response.
 */
export default async function handler(request, response) {
    // 1. Validasi Metode Request
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    const { event, data } = request.body;
    
    // 2. Validasi Event Webhook (hanya proses pembayaran sukses)
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        console.log(`INFO: Webhook diterima, tetapi bukan pembayaran sukses. Status: ${data.status}`);
        return response.status(200).json({ message: 'Webhook received, no action needed.' });
    }

    const { customerEmail, amount, merchantRef, id: mayarTransactionId } = data;

    try {
        // 3. Menjalankan semua operasi database dalam satu transaksi yang aman
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);

            // --- Langkah A: Temukan Pengguna yang Melakukan Pembayaran ---
            const userQuery = usersRef.where('email', '==', customerEmail).limit(1);
            const userSnapshot = await transaction.get(userQuery);
            
            if (userSnapshot.empty) {
                console.error(`FATAL ERROR: Pengguna dengan email ${customerEmail} tidak ditemukan.`);
                throw new Error(`User with email ${customerEmail} not found.`); // Hentikan transaksi
            }
            
            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            const userDocRef = userDoc.ref;

            // --- Langkah B: Cek Apakah Ada Kode Rujukan & Temukan Mitra ---
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            const referredByCode = pendingCommissionDoc.exists ? pendingCommissionDoc.data().referredByCode : null;
            let partnerDoc = null;

            if (referredByCode) {
                const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
                const partnerSnapshot = await transaction.get(partnerQuery);
                if (!partnerSnapshot.empty) {
                    partnerDoc = partnerSnapshot.docs[0];
                }
            }

            // --- Langkah C: Tentukan Detail Langganan & Komisi Berdasarkan Jumlah Pembayaran ---
            let plan = 'bulanan'; // Default plan
            let commissionAmount = 0;
            let subscriptionEndDate;
            const now = new Date();

            if (amount === 250000 || amount === 350000) {
                plan = 'bulanan';
                commissionAmount = 50000;
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else if (amount === 2500000 || amount === 4200000) {
                plan = 'tahunan';
                commissionAmount = 500000;
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            } else {
                // Pengaman jika jumlah tidak cocok, tetap berikan 1 bulan
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            }
            
            // --- Langkah D: Update Dokumen Pengguna dengan Status Langganan Baru ---
            transaction.set(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                plan: plan,
                trialEndDate: admin.firestore.FieldValue.delete(), // Hapus masa trial jika ada
                lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
            }, { merge: true });

            // --- Langkah E: Buat Dokumen Komisi untuk Mitra (jika ada) ---
            if (partnerDoc && commissionAmount > 0) {
                const partnerId = partnerDoc.id;
                const commissionDocRef = db.collection('commissions').doc();

                transaction.set(commissionDocRef, {
                    partnerId: partnerId,
                    partnerEmail: partnerDoc.data().email,
                    referredUserId: userId,
                    referredUserEmail: customerEmail,
                    transactionAmount: amount,
                    commissionAmount: commissionAmount,
                    status: 'unpaid',
                    createdAt: now,
                    mayarInvoiceId: mayarTransactionId
                });
                console.log(`✅ BERHASIL: Komisi sebesar ${commissionAmount} untuk mitra ${partnerId} dicatat.`);

                // Hapus data rujukan yang sudah diproses
                transaction.delete(pendingCommissionRef);
                console.log(`INFO: Data pending untuk ${customerEmail} berhasil dihapus.`);
            } else if (referredByCode) {
                console.error(`❌ PERINGATAN: Kode rujukan ${referredByCode} ada, tetapi mitra tidak ditemukan.`);
                transaction.delete(pendingCommissionRef); // Tetap hapus agar tidak diproses lagi
            }
        });

        return response.status(200).json({ message: 'Webhook berhasil diproses.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
        return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
    }
}

