import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../src/firebase'; // Pastikan path ini benar
import admin from 'firebase-admin';

// Inisialisasi Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS))
    });
}
const firestoreAdmin = admin.firestore();

export default async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Validasi token dari header yang benar ('x-callback-token')
    const mayarTokenHeader = req.headers['x-callback-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;

    try {
        // Hanya proses jika event adalah invoice.paid
        if (event.type === 'invoice.paid' && event.status === 'paid') {
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;
            
            console.log(`Webhook 'invoice.paid' diterima untuk email: ${customerEmail}`);

            // Logika untuk pendaftaran mitra (tetap sama)
            if (merchantRef && merchantRef.startsWith('PARTNERREG-')) {
                const userId = merchantRef.split('-')[1];
                const newReferralCode = 'PARTNER-' + userId.slice(0, 5).toUpperCase();
                
                const userDocRef = firestoreAdmin.collection("users").doc(userId);
                await userDocRef.set({
                    isPartner: true,
                    referralCode: newReferralCode
                }, { merge: true });
                
                console.log(`Pendaftaran mitra berhasil untuk user ${userId}.`);
                return res.status(200).json({ message: 'Partner registration processed' });
            }

            // --- LOGIKA BARU & LEBIH AMAN UNTUK LANGGANAN ---
            // 1. Cari user di database berdasarkan email dari webhook
            const usersCollection = firestoreAdmin.collection("users");
            const q = usersCollection.where("email", "==", customerEmail).limit(1);
            const userSnapshot = await q.get();

            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                // 2. Tentukan paket langganan dari merchantRef (ini masih berguna)
                const plan = merchantRef.includes('bulanan') ? 'bulanan' : 'tahunan';
                console.log(`User ditemukan: ${userId}, Paket: ${plan}`);

                // 3. Hitung tanggal kedaluwarsa baru
                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
                console.log(`Tanggal kedaluwarsa baru: ${subscriptionEndDate.toISOString()}`);

                // 4. Update data user di Firestore
                await firestoreAdmin.collection("users").doc(userId).set({
                    subscriptionStatus: 'active',
                    subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate)
                }, { merge: true });
                
                console.log(`SUKSES: Langganan untuk user ${userId} telah diaktifkan.`);

                // Logika untuk komisi rujukan (tetap sama)
                if (userData && userData.referredBy) {
                    // ... (kode komisi Anda sudah benar dan bisa ditaruh di sini)
                }

            } else {
                console.error(`ERROR: User dengan email ${customerEmail} tidak ditemukan di database.`);
            }

        }
        
        // Jika event bukan 'invoice.paid' atau sudah diproses, kirim respon sukses
        return res.status(200).json({ message: 'Webhook event processed or ignored' });

    } catch (error) {
        console.error('Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}