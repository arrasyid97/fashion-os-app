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

    const { event, data } = request.body;
    
    // Pastikan event adalah pembayaran sukses
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        console.log(`INFO: Webhook diterima, tetapi bukan event pembayaran sukses. Status: ${data.status}`);
        return response.status(200).json({ message: 'Webhook diterima, tetapi tidak ada aksi yang diperlukan.' });
    }

    const { customerEmail, amount, merchantRef, id: mayarTransactionId } = data; // Perbaikan: Tambahkan merchantRef di sini

    try {
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);

            const userQuery = usersRef.where('email', '==', customerEmail).limit(1);
            const userSnapshot = await transaction.get(userQuery);
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            
            if (userSnapshot.empty) {
                console.error(`FATAL ERROR: Tidak ada pengguna yang ditemukan dengan email ${customerEmail}`);
                return;
            }

            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            
            const referredByCode = pendingCommissionDoc.exists ? pendingCommissionDoc.data().referredByCode : null;
            let partnerDoc = null;

            if (referredByCode) {
                const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
                const partnerSnapshot = await transaction.get(partnerQuery);
                if (!partnerSnapshot.empty) {
                    partnerDoc = partnerSnapshot.docs[0];
                }
            }

            // Perbarui status langganan pengguna
            const plan = (amount === 250000 || amount === 2500000) ? 'bulanan' : 'tahunan'; // Perbaikan: Sesuaikan harga diskon Anda
            const now = new Date();
            let subscriptionEndDate;
            if (plan === 'bulanan') {
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else {
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            }

            const userDocRef = usersRef.doc(userId);
            transaction.set(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                plan: plan,
                trialEndDate: admin.firestore.FieldValue.delete(),
                lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
            }, { merge: true });

            if (partnerDoc) {
                const partnerId = partnerDoc.id;
                const commissionAmount = amount * 0.10;

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
                console.log(`✅ BERHASIL: Komisi untuk mitra ${partnerId} dicatat.`);

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