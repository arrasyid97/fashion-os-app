import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../src/firebase';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS))
    });
}
const firestoreAdmin = admin.firestore();

export default async function (req, res) {
    console.log('--- Webhook Mayar Diterima ---');
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
        console.log('Status: 405 Method Not Allowed');
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const mayarTokenHeader = req.headers['x-callback-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;

    try {
        if (event.event === 'payment.received' && event.data.status === 'SUCCESS') {
            console.log(`Event 'payment.received' dengan status 'SUCCESS' diterima.`);
            
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;
            const amountPaid = event.data.amount; // Jumlah pembayaran yang akan kita gunakan untuk komisi

            console.log(`Debugging: Merchant Ref: ${merchantRef}, Customer Email: ${customerEmail}`);

            const usersCollection = firestoreAdmin.collection("users");
            const q = usersCollection.where("email", "==", customerEmail).limit(1);
            const userSnapshot = await q.get();

            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                console.log(`User ditemukan! User ID: ${userId}, Data:`, userData);
                
                // Logika langganan (sudah kita perbaiki sebelumnya)
                const plan = merchantRef.includes('bulanan') ? 'bulanan' : 'tahunan';
                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
                await firestoreAdmin.collection("users").doc(userId).set({
                    subscriptionStatus: 'active',
                    subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate)
                }, { merge: true });
                
                console.log(`✅ SUKSES: Langganan untuk user ${userId} berhasil diaktifkan.`);

                // --- LOGIKA BARU UNTUK KOMISI MITRA ---
                if (userData.referredBy) {
                    console.log(`Pelanggan ini direferensikan oleh: ${userData.referredBy}`);
                    
                    // Anggap persentase komisi 10%
                    const commissionRate = 0.10; 
                    const commissionAmount = Math.round(amountPaid * commissionRate);
                    
                    // Siapkan data komisi
                    const commissionData = {
                        referredByUserId: userData.referredBy,
                        customerUserId: userId,
                        customerEmail: customerEmail,
                        amount: commissionAmount,
                        transactionAmount: amountPaid,
                        status: 'unpaid', // Komisi awal berstatus 'unpaid'
                        createdAt: Timestamp.now(),
                    };
                    
                    // Simpan data komisi ke Firestore
                    await firestoreAdmin.collection("commissions").add(commissionData);
                    
                    console.log(`Komisi sebesar Rp ${commissionAmount} berhasil dicatat untuk user mitra ${userData.referredBy}.`);
                } else {
                    console.log('Pelanggan tidak memiliki kode rujukan. Tidak ada komisi yang dicatat.');
                }

            } else {
                console.error(`❌ ERROR: User dengan email ${customerEmail} tidak ditemukan di database.`);
            }
        } else {
            console.log(`Event bukan 'payment.received' atau status bukan 'SUCCESS'. Diabaikan.`);
        }
        
        console.log('Webhook event diproses atau diabaikan. Mengirim respons 200.');
        return res.status(200).json({ message: 'Webhook event processed or ignored' });

    } catch (error) {
        console.error('Fatal Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}