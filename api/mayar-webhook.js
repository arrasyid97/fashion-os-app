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

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    // --- PERUBAHAN UTAMA DI SINI ---
    const mayarToken = request.headers['x-callback-token']; // Nama header diperbaiki
    const webhookToken = process.env.MAYAR_WEBHOOK_TOKEN ? process.env.MAYAR_WEBHOOK_TOKEN.trim() : null;

    // Verifikasi Token Webhook
    if (!mayarToken || mayarToken !== webhookToken) {
        console.warn('PERINGATAN: Upaya akses webhook tidak sah terdeteksi. Token tidak cocok.');
        console.log('Token dari Header Mayar (x-callback-token):', mayarToken || 'TIDAK DITEMUKAN');
        console.log('Token dari Vercel Env:', webhookToken || 'TIDAK DITEMUKAN');
        return response.status(401).json({ message: 'Unauthorized' });
    }
    
    const { event, data } = request.body;
    
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        return response.status(200).json({ message: 'Webhook received, no action needed.' });
    }

    const { customerEmail, amount, merchantRef, id: mayarTransactionId } = data;
console.log(`Webhook Diterima - Amount: ${amount}, Tipe Data: ${typeof amount}`);
    try {
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);
            const userQuery = usersRef.where('email', '==', customerEmail).limit(1);
            const userSnapshot = await transaction.get(userQuery);
            
            if (userSnapshot.empty) {
                throw new Error(`User with email ${customerEmail} not found.`);
            }
            
            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            const userDocRef = userDoc.ref;
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

            let plan = 'bulanan';
            let commissionAmount = 0;
            let subscriptionEndDate;
            const now = new Date();

            if (amount === 5000 || amount === 350000 || amount === 5000) {
                plan = 'bulanan';
                commissionAmount = 50000;
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else if (amount === 2500000 || amount === 4200000 || amount === 2500000) { // <-- TAMBAHKAN INI
                plan = 'tahunan';
                commissionAmount = 500000;
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            } else {
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
                transaction.delete(pendingCommissionRef);
            } else if (referredByCode) {
                console.error(`PERINGATAN: Kode rujukan ${referredByCode} ada, tetapi mitra tidak ditemukan.`);
                transaction.delete(pendingCommissionRef);
            }
        });

        return response.status(200).json({ message: 'Webhook berhasil diproses.' });
    } catch (error) {
        console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
        return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
    }
}