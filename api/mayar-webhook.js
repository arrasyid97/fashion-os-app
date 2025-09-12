import { Timestamp } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// Inisialisasi Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS))
    });
}
const firestoreAdmin = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Validasi token dari header
    const mayarTokenHeader = req.headers['x-callback-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;
    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const payload = req.body;

    try {
        // --- KONDISI BARU YANG BENAR (Berdasarkan Log Anda) ---
        if (payload.event === 'payment.received' && payload.data?.status === 'SUCCESS') {
            
            const data = payload.data;
            const customerEmail = data.customerEmail;
            
            console.log(`Pembayaran sukses diterima untuk email: ${customerEmail}`);

            // Cek apakah ini adalah pembayaran untuk langganan/membership
            if (data.productDescription && data.productDescription.toLowerCase().includes('langganan')) {
                
                // Cari user di database berdasarkan email
                const usersCollection = firestoreAdmin.collection("users");
                const q = usersCollection.where("email", "==", customerEmail).limit(1);
                const userSnapshot = await q.get();

                if (!userSnapshot.empty) {
                    const userDoc = userSnapshot.docs[0];
                    const userId = userDoc.id;
                    
                    // Tentukan paket langganan dari deskripsi produk
                    const plan = data.productDescription.toLowerCase().includes('bulanan') ? 'bulanan' : 'tahunan';
                    console.log(`User ditemukan: ${userId}, Memperbarui paket: ${plan}`);

                    // Hitung tanggal kedaluwarsa baru
                    const now = new Date();
                    const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
                    
                    // Update data user di Firestore
                    await firestoreAdmin.collection("users").doc(userId).set({
                        subscriptionStatus: 'active',
                        subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
                        plan: plan
                    }, { merge: true });

                    console.log(`SUKSES: Langganan untuk user ${userId} telah diaktifkan.`);
                    return res.status(200).json({ message: 'Subscription updated successfully.' });

                } else {
                    console.error(`ERROR: User dengan email ${customerEmail} tidak ditemukan di database.`);
                    return res.status(404).json({ message: 'User not found' });
                }
            }
        }
        
        // Jika event bukan yang kita proses, abaikan
        return res.status(200).json({ message: 'Webhook event received but not relevant.' });

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}