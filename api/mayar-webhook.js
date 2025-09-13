import admin from 'firebase-admin';

// Inisialisasi Firebase Admin SDK
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
            
            const customerEmail = event.data?.customerEmail;
            const amountPaid = event.data?.amount;
            const productDescription = event.data?.productDescription;
            const referredByCode = req.body.referred_by_code; // Ambil kode dari payload frontend
            
            console.log(`Debugging: Customer Email: ${customerEmail}, Amount: ${amountPaid}, Description: ${productDescription}, Referral Code: ${referredByCode}`);

            if (!customerEmail || !amountPaid || !productDescription) {
                console.error('❌ ERROR: Data customerEmail, amount, atau productDescription tidak ditemukan di body webhook.');
                return res.status(400).json({ message: 'Missing required data from webhook body' });
            }

            const usersCollection = firestoreAdmin.collection("users");
            const q = usersCollection.where("email", "==", customerEmail).limit(1);
            const userSnapshot = await q.get();

            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                console.log(`User ditemukan! User ID: ${userId}, Data:`, userData);

                const plan = productDescription.includes('Paket Bulanan') ? 'bulanan' : 'tahunan';
                console.log(`Paket langganan terdeteksi: ${plan}`);

                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
                
                console.log('Mencoba memperbarui dokumen user menggunakan Timestamp dari firebase-admin...');
                await firestoreAdmin.collection("users").doc(userId).set({
                    subscriptionStatus: 'active',
                    subscriptionEndDate: admin.firestore.Timestamp.fromDate(subscriptionEndDate)
                }, { merge: true });
                
                console.log(`✅ SUKSES: Langganan untuk user ${userId} berhasil diaktifkan.`);

                // --- KODE PENTING: MENCATAT KOMISI BERDASARKAN KODE DARI PAYLOAD ---
                if (referredByCode) {
                    const partnerQuery = firestoreAdmin.collection("users").where("referralCode", "==", referredByCode).limit(1);
                    const partnerSnapshot = await partnerQuery.get();

                    if (!partnerSnapshot.empty) {
                        const partnerDoc = partnerSnapshot.docs[0];
                        const partnerId = partnerDoc.id;
                        
                        const commissionAmount = 50000; // Komisi tetap Rp 50.000
                        
                        await firestoreAdmin.collection("commissions").add({
                            referredByUserId: partnerId,
                            customerUserId: userId,
                            customerEmail: customerEmail,
                            amount: commissionAmount,
                            transactionAmount: amountPaid,
                            status: 'unpaid',
                            createdAt: admin.firestore.Timestamp.now(),
                        });
                        console.log(`✅ Komisi sebesar Rp ${commissionAmount} berhasil dicatat untuk user mitra ${referredByCode}.`);
                    } else {
                        console.log(`❌ Kode rujukan '${referredByCode}' tidak valid atau bukan mitra. Komisi tidak dicatat.`);
                    }
                } else {
                    console.log('Pelanggan tidak memiliki kode rujukan. Tidak ada komisi yang dicatat.');
                }
                // --- AKHIR KODE KOMISI BARU ---

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