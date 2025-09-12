import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../src/firebase';

export default async function (req, res) {
    // Pastikan metode adalah POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const mayarTokenHeader = req.headers['mayar-webhook-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

    // Verifikasi token webhook
    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;
    
    try {
        // Hanya proses event 'invoice.paid' dengan status 'paid'
        if (event.type === 'invoice.paid' && event.status === 'paid') {
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;
            
            console.log(`Webhook received for merchant_ref: ${merchantRef}`);

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

            // Logika untuk pembayaran langganan
            const parts = merchantRef.split('-');
            if (parts.length >= 3) {
                const userId = parts[1];
                const plan = parts[3];
                
                // Transaksi untuk memastikan konsistensi data
                await runTransaction(db, async (transaction) => {
                    const userDocRef = doc(db, "users", userId);
                    const userDoc = await transaction.get(userDocRef);

                    if (!userDoc.exists()) {
                        throw new Error("User document not found");
                    }
                    
                    const now = new Date();
                    const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));

                    // Perbarui status langganan
                    transaction.set(userDocRef, {
                        subscriptionStatus: 'active',
                        subscriptionEndDate: subscriptionEndDate
                    }, { merge: true });

                    const userData = userDoc.data();
                    if (userData && userData.referredBy) {
                        const referralCode = userData.referredBy;
                        console.log(`User ini diajak oleh mitra dengan kode: ${referralCode}`);

                        const partnerQuery = query(collection(db, "users"), where("referralCode", "==", referralCode));
                        const partnerDocs = await getDocs(partnerQuery);
                        if (!partnerDocs.empty) {
                            const partnerId = partnerDocs.docs[0].id;
                            const commissionAmount = 25000;
                            const commissionDocRef = doc(collection(db, "commissions"));
                            
                            transaction.set(commissionDocRef, {
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
                });

                console.log(`Status langganan untuk user ${userId} berhasil diperbarui.`);
                return res.status(200).json({ message: 'Webhook processed successfully' });
            }
        }
        
        return res.status(200).json({ message: 'Ignored webhook event' });
    } catch (error) {
        console.error('Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}