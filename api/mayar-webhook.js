const admin = require('firebase-admin');

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

    console.log("--- LOG: Menerima Webhook dari Mayar ---");
    console.log("Body:", JSON.stringify(request.body, null, 2));

    const { event, data } = request.body;
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        console.log(`INFO: Webhook diterima, tetapi bukan event pembayaran sukses. Status: ${data.status}`);
        return response.status(200).json({ message: 'Webhook diterima, tetapi tidak ada aksi yang diperlukan.' });
    }

    const { customerEmail, amount, id: mayarTransactionId } = data;

    try {
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);

            // 1. Ambil data pengguna dan data referral yang tertunda dalam satu transaksi
            const userQuery = await transaction.get(usersRef.where('email', '==', customerEmail).limit(1));
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            
            if (userQuery.empty) {
                console.error(`FATAL ERROR: Tidak ada pengguna yang ditemukan dengan email ${customerEmail}`);
                return; // Membatalkan transaksi
            }

            const userDoc = userQuery.docs[0];
            const userId = userDoc.id;
            
            const plan = (amount === 250000 || amount === 3000000) ? 'bulanan' : 'tahunan';
            const now = new Date();
            let subscriptionEndDate;
            if (plan === 'bulanan') {
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else {
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            }

            // 2. Perbarui status langganan pengguna
            const userDocRef = db.collection('users').doc(userId);
            transaction.set(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                plan: plan,
                trialEndDate: admin.firestore.FieldValue.delete(),
                lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
            }, { merge: true });

            // 3. Jika ada data referral yang tertunda, catat komisi
            if (pendingCommissionDoc.exists) {
                const referredByCode = pendingCommissionDoc.data().referredByCode;
                const partnerQuery = await transaction.get(usersRef.where('referralCode', '==', referredByCode).limit(1));
                
                if (!partnerQuery.empty) {
                    const partnerDoc = partnerQuery.docs[0];
                    const partnerId = partnerDoc.id;
                    const commissionAmount = amount * 0.10;

                    const commissionDocRef = db.collection('commissions').doc();
                    transaction.set(commissionDocRef, {
                        partnerId: partnerId, partnerEmail: partnerDoc.data().email,
                        referredUserId: userId, referredUserEmail: customerEmail,
                        transactionAmount: amount, commissionAmount: commissionAmount,
                        status: 'unpaid', createdAt: now, mayarInvoiceId: mayarTransactionId
                    });
                    console.log(`✅ BERHASIL: Komisi untuk mitra ${partnerId} dicatat.`);

                    // 4. Hapus data pending setelah komisi berhasil dicatat
                    transaction.delete(pendingCommissionRef);
                    console.log(`INFO: Data pending untuk ${customerEmail} berhasil dihapus.`);
                } else {
                    console.error(`❌ PERINGATAN: Kode rujukan ${referredByCode} ditemukan, tetapi tidak ada mitra yang cocok.`);
                    // Hapus data pending untuk mencegah bug di masa depan
                    transaction.delete(pendingCommissionRef);
                }
            }
        });

        return response.status(200).json({ message: 'Webhook berhasil diproses.' });

    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
        return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
    }
}