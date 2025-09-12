import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../src/firebase';
import admin from 'firebase-admin';
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

    const mayarTokenHeader = req.headers['mayar-webhook-token'];
    const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;
console.log("TOKEN YANG DIKIRIM MAYAR:", mayarTokenHeader);
console.log("TOKEN YANG ADA DI VERCEL:", myWebhookToken);
    if (mayarTokenHeader !== myWebhookToken) {
        console.error('Webhook Unauthorized: Invalid token');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const event = req.body;

    try {
        if (event.type === 'invoice.paid' && event.status === 'paid') {
            const merchantRef = event.data.merchant_ref;
            const customerEmail = event.data.customer_email;
            
            console.log(`Webhook received for merchant_ref: ${merchantRef}`);

            // Logika untuk pendaftaran mitra
            if (merchantRef.startsWith('PARTNERREG-')) {
                const userId = merchantRef.split('-')[1];
                const newReferralCode = 'PARTNER-' + userId.slice(0, 5).toUpperCase();
                
                const userDocRef = firestoreAdmin.collection("users").doc(userId);
                await userDocRef.set({
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
                
                const userDocRef = firestoreAdmin.collection("users").doc(userId);
                const userDoc = await userDocRef.get();
                if (!userDoc.exists) {
                    throw new Error("User document not found");
                }
                
                const now = new Date();
                const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + (plan === 'bulanan' ? 1 : 12)));

                await userDocRef.set({
                    subscriptionStatus: 'active',
                    subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate)
                }, { merge: true });
                console.log(`Status langganan untuk user ${userId} berhasil diperbarui.`);

                const userData = userDoc.data();
                if (userData && userData.referredBy) {
                    const referralCode = userData.referredBy;
                    console.log(`User ini diajak oleh mitra dengan kode: ${referralCode}`);

                    const partnerQuery = firestoreAdmin.collection("users").where("referralCode", "==", referralCode).limit(1);
                    const partnerDocs = await partnerQuery.get();

                    if (!partnerDocs.empty) {
                        const partnerId = partnerDocs.docs[0].id;
                        const commissionAmount = 25000;
                        await firestoreAdmin.collection("commissions").add({
                            partnerId: partnerId,
                            referredUserId: userId,
                            paymentDate: Timestamp.fromDate(now),
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
        }
        
        return res.status(200).json({ message: 'Ignored webhook event' });
    } catch (error) {
        console.error('Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}