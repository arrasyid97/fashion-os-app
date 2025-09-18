const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
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

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    const { event, data } = request.body;
    
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        console.log(`INFO: Webhook received, but it's not a successful payment event. Status: ${data.status}`);
        return response.status(200).json({ message: 'Webhook received, no action needed.' });
    }

    const { customerEmail, amount, merchantRef, id: mayarTransactionId } = data;

    try {
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);

            // ▼▼▼ PERBAIKAN UTAMA: KEMBALI MENCARI BERDASARKAN EMAIL ▼▼▼
            // Ini lebih andal untuk pengguna yang baru saja mendaftar.
            const userQuery = usersRef.where('email', '==', customerEmail).limit(1);
            const userSnapshot = await transaction.get(userQuery);
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            
            if (userSnapshot.empty) {
                console.error(`FATAL ERROR: Tidak ada pengguna yang ditemukan dengan email ${customerEmail}`);
                throw new Error(`User with email ${customerEmail} not found.`);
            }

            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            const userDocRef = userDoc.ref; // Mengambil referensi dokumen langsung
            // ▲▲▲ AKHIR PERBAIKAN UTAMA ▲▲▲
            
            const referredByCode = pendingCommissionDoc.exists ? pendingCommissionDoc.data().referredByCode : null;
            let partnerDoc = null;

            if (referredByCode) {
                const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
                const partnerSnapshot = await transaction.get(partnerQuery);
                if (!partnerSnapshot.empty) {
                    partnerDoc = partnerSnapshot.docs[0];
                }
            }

            let plan;
            let commissionAmount = 0;

            // Cek jumlah pembayaran untuk menentukan komisi DAN jenis paket
            if (amount === 250000 || amount === 350000) { // Harga paket bulanan
                plan = 'bulanan';
                commissionAmount = 50000;
            } else if (amount === 2500000 || amount === 4200000) { // Harga paket tahunan
                plan = 'tahunan';
                commissionAmount = 500000;
            }
            
            const now = new Date();
            let subscriptionEndDate;
            if (plan === 'bulanan') {
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else if (plan === 'tahunan') {
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            } else {
                // Sebagai pengaman jika jenis paket tidak terdeteksi, berikan 1 bulan.
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            }

            transaction.set(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                plan: plan,
                trialEndDate: admin.firestore.FieldValue.delete(),
                lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
            }, { merge: true });

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

                transaction.delete(pendingCommissionRef);
                console.log(`INFO: Data pending untuk ${customerEmail} berhasil dihapus.`);
            } else if (referredByCode) {
                console.error(`❌ PERINGATAN: Kode rujukan ${referredByCode} ditemukan, tetapi tidak ada mitra yang cocok.`);
                transaction.delete(pendingCommissionRef);
            }
        });

        return response.status(200).json({ message: 'Webhook berhasil diproses.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
        return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
    }
}
