import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
            
            // Logika untuk pendaftaran mitra
            if (merchantRef.startsWith('PARTNERREG-')) {
                const userId = merchantRef.split('-')[1];
                const newReferralCode = 'PARTNER-' + userId.slice(0, 5).toUpperCase();
                
                const userDocRef = doc(db, "users", userId);
                await setDoc(userDocRef, {
                    isPartner: true,
                    referralCode: newReferralCode
                }, { merge: true });
                
                console.log(`Pendaftaran mitra berhasil untuk user ${userId}. Referral Code: ${newReferralCode}`);
                return res.status(200).json({ message: 'Partner registration webhook processed successfully' });
            }

            // Logika yang sudah ada untuk pembayaran langganan
            const parts = merchantRef.split('-');
            if (parts.length >= 3) {
                const userId = parts[1];
                const plan = parts[3];
                const userDocRef = doc(db, "users", userId);
                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));

                // Perbarui status langganan pengguna
                await setDoc(userDocRef, {
                    subscriptionStatus: 'active',
                    subscriptionEndDate: subscriptionEndDate
                }, { merge: true });

                console.log(`Status langganan untuk user ${userId} berhasil diperbarui.`);

                // Logika Komisi Mitra
                const userDoc = await getDoc(userDocRef);
                const userData = userDoc.data();

                if (userData && userData.referredBy) {
                    const referralCode = userData.referredBy;
                    console.log(`User ini diajak oleh mitra dengan kode: ${referralCode}`);

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
            }

            return res.status(200).json({ message: 'Webhook processed successfully' });
        } else {
            return res.status(200).json({ message: 'Ignored webhook event' });
        }
    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            console.error('Error DNS: Tidak dapat menemukan domain API Mayar. Pastikan URL sudah benar.');
            return res.status(503).json({ message: 'Layanan Mayar tidak dapat dijangkau.', error: error.message });
        }
        
        console.error('Error processing webhook:', error.response?.data || error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.response?.data || error.message });
    }
}