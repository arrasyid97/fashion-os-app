import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../src/firebase';
import admin from 'firebase-admin';

// Inisialisasi Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS))
    });
}
const firestoreAdmin = admin.firestore();

export default async function (req, res) {
    // --- Log Awal: Menerima Permintaan ---
    console.log('--- Webhook Mayar Diterima ---');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    if (req.method !== 'POST') {
        console.log('Status: 405 Method Not Allowed');
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Validasi token dari header yang benar ('x-callback-token')
    const mayarTokenHeader = req.headers['x-callback-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

    if (mayarTokenHeader !== myWebhookToken) {
        // --- Log Kesalahan: Token tidak valid ---
        console.error('Webhook Unauthorized: Invalid token');
        console.log('Token dari Mayar:', mayarTokenHeader);
        console.log('Token di Vercel:', myWebhookToken);
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;

    try {
        // Hanya proses jika event adalah invoice.paid
        if (event.type === 'invoice.paid' && event.status === 'paid') {
            console.log(`Event 'invoice.paid' diterima. Status: ${event.status}`);
            
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;
            
            // Log untuk debugging email dan merchant_ref
            console.log(`Debugging: Merchant Ref: ${merchantRef}, Customer Email: ${customerEmail}`);

            // Logika untuk pendaftaran mitra
            if (merchantRef && merchantRef.startsWith('PARTNERREG-')) {
                const userId = merchantRef.split('-')[1];
                const newReferralCode = 'PARTNER-' + userId.slice(0, 5).toUpperCase();
                
                const userDocRef = firestoreAdmin.collection("users").doc(userId);
                console.log(`Mencoba update user ${userId} untuk pendaftaran mitra.`);
                await userDocRef.set({
                    isPartner: true,
                    referralCode: newReferralCode
                }, { merge: true });
                
                console.log(`SUKSES: Pendaftaran mitra berhasil untuk user ${userId}.`);
                return res.status(200).json({ message: 'Partner registration processed' });
            }

            // --- LOGIKA UTAMA UNTUK LANGGANAN ---
            // 1. Cari user di database berdasarkan email dari webhook
            console.log(`Mulai mencari user dengan email: ${customerEmail}`);
            const usersCollection = firestoreAdmin.collection("users");
            const q = usersCollection.where("email", "==", customerEmail).limit(1);
            const userSnapshot = await q.get();

            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                console.log(`User ditemukan! User ID: ${userId}, Data:`, userData);
                
                // 2. Tentukan paket langganan dari merchantRef
                const plan = merchantRef.includes('bulanan') ? 'bulanan' : 'tahunan';
                console.log(`Paket langganan terdeteksi: ${plan}`);

                // 3. Hitung tanggal kedaluwarsa baru
                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
                console.log(`Tanggal kedaluwarsa baru dihitung: ${subscriptionEndDate.toISOString()}`);

                // 4. Update data user di Firestore
                console.log('Mencoba memperbarui dokumen user...');
                await firestoreAdmin.collection("users").doc(userId).set({
                    subscriptionStatus: 'active',
                    subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate)
                }, { merge: true });
                
                console.log(`✅ SUKSES: Langganan untuk user ${userId} berhasil diaktifkan di Firestore.`);

                // Logika untuk komisi rujukan (tetap sama)
                // ...
            } else {
                // --- Log Kesalahan: User tidak ditemukan ---
                console.error(`❌ ERROR: User dengan email ${customerEmail} tidak ditemukan di database.`);
            }

        }
        
        console.log('Webhook event diproses atau diabaikan. Mengirim respons 200.');
        return res.status(200).json({ message: 'Webhook event processed or ignored' });

    } catch (error) {
        // --- Log Kesalahan Global ---
        console.error('Fatal Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}