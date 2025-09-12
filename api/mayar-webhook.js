import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebase'; // Sesuaikan jalur jika berbeda

export default async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const mayarTokenHeader = req.headers['mayar-webhook-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

    // Langkah 1: Verifikasi token untuk memastikan permintaan dari Mayar
    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;

    try {
        // Langkah 2: Memastikan event adalah pembayaran invoice yang berhasil
        if (event.type === 'invoice.paid' && event.status === 'paid') {
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;

            // merchantRef: FASHIONOS-UID-TIMESTAMP-PLAN
            const parts = merchantRef.split('-');
            if (parts.length < 3) {
                console.error('Invalid merchant_ref format');
                return res.status(400).json({ message: 'Invalid merchant_ref format' });
            }
            const userId = parts[1];
            const plan = parts[3];

            console.log(`Webhook diterima. Pembayaran berhasil untuk user: ${customerEmail} (ID: ${userId})`);

            // Langkah 3: Perbarui status langganan pengguna di koleksi 'users'
            const userDocRef = doc(db, "users", userId);
            const now = new Date();
            const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));
            
            await setDoc(userDocRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate
            }, { merge: true });

            console.log(`Status langganan untuk user ${userId} berhasil diperbarui.`);

            // Langkah 4: Logika Komisi Mitra
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.data();

            if (userData && userData.referredBy) {
                const referralCode = userData.referredBy;
                console.log(`User ini diajak oleh mitra dengan kode: ${referralCode}`);

                // Cari mitra yang memiliki kode rujukan ini
                const partnerQuery = query(collection(db, "users"), where("referralCode", "==", referralCode));
                const partnerDocs = await getDocs(partnerQuery);

                if (!partnerDocs.empty) {
                    const partnerId = partnerDocs.docs[0].id;
                    const commissionAmount = 25000; // Contoh: Rp 25.000 per langganan baru

                    const commissionDocRef = doc(collection(db, "commissions"));
                    await setDoc(commissionDocRef, {
                        partnerId: partnerId,
                        referredUserId: userId,
                        paymentDate: new Date(),
                        amount: commissionAmount,
                        status: 'unpaid'
                    });
                    console.log(`Komisi sebesar ${commissionAmount} berhasil dicatat untuk mitra ${partnerId}.`);
                } else {
                    console.warn(`Mitra dengan kode rujukan ${referralCode} tidak ditemukan.`);
                }
            }

            return res.status(200).json({ message: 'Webhook processed successfully' });
        } else {
            return res.status(200).json({ message: 'Ignored webhook event' });
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}