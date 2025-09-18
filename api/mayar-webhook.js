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

    const { customerEmail, amount, id: mayarTransactionId } = data;

    // Definisikan semua harga yang mungkin ada di aplikasi Anda
    const prices = {
        monthly: { normal: 350000, discounted: 250000 },
        yearly: { normal: 4200000, discounted: 2500000 },
        partnerRegistration: 50000
    };

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
                throw new Error(`User with email ${customerEmail} not found.`);
            }
            
            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            const userDocRef = userDoc.ref;

            // --- Langkah B: Proses Pendaftaran Mitra jika jumlahnya Rp 50.000 ---
            if (amount === prices.partnerRegistration) {
                // Tambahkan kode rujukan unik untuk mitra baru
                const generatePartnerCode = () => {
                    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let result = 'PARTNER-';
                    for (let i = 0; i < 5; i++) {
                        result += characters.charAt(Math.floor(Math.random() * characters.length));
                    }
                    return result;
                };

                const newReferralCode = generatePartnerCode();

                transaction.update(userDocRef, { 
                    isPartner: true,
                    referralCode: newReferralCode
                });
                console.log(`✅ BERHASIL: Pengguna ${customerEmail} berhasil menjadi Mitra dengan kode ${newReferralCode}.`);
                return; // Berhenti di sini, tidak perlu memproses langganan
            }

            // --- Langkah C: Tentukan Detail Langganan & Komisi Berdasarkan Jumlah Pembayaran ---
            const now = new Date();
            let plan;
            let commissionAmount = 0;
            let subscriptionEndDate;

            if (amount === prices.monthly.normal || amount === prices.monthly.discounted) {
                plan = 'bulanan';
                commissionAmount = 50000;
                subscriptionEndDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
            } else if (amount === prices.yearly.normal || amount === prices.yearly.discounted) {
                plan = 'tahunan';
                commissionAmount = 500000;
                subscriptionEndDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
            } else {
                console.error(`PERINGATAN: Pembayaran dengan jumlah tidak dikenal: ${amount}. Tidak ada tindakan.`);
                return; // Keluar dari transaksi jika jumlah tidak valid
            }

            // --- Langkah D: Cek Kode Rujukan & Temukan Mitra jika pembayaran adalah harga diskon ---
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            let partnerDoc = null;
            if (pendingCommissionDoc.exists && (amount === prices.monthly.discounted || amount === prices.yearly.discounted)) {
                const referredByCode = pendingCommissionDoc.data().referredByCode;
                const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
                const partnerSnapshot = await transaction.get(partnerQuery);
                if (!partnerSnapshot.empty) {
                    partnerDoc = partnerSnapshot.docs[0];
                }

                // Hapus data rujukan yang sudah diproses agar tidak digunakan lagi
                transaction.delete(pendingCommissionRef);
                console.log(`INFO: Data pending untuk ${customerEmail} berhasil dihapus.`);
            }

            // --- Langkah E: Update Dokumen Pengguna dengan Status Langganan Baru ---
            transaction.set(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                plan: plan,
                trialEndDate: admin.firestore.FieldValue.delete(),
                lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
            }, { merge: true });

            // --- Langkah F: Buat Dokumen Komisi untuk Mitra (jika ada) ---
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
            }
        });

        return response.status(200).json({ message: 'Webhook berhasil diproses.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
        return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
    }
}