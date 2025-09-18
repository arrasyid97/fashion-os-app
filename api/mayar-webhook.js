const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
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

    const { event, data } = request.body;
    
    if (event !== 'payment.received' || data.status !== 'SUCCESS') {
        console.log(`INFO: Webhook received, but it's not a successful payment event. Status: ${data.status}`);
        return response.status(200).json({ message: 'Webhook received, no action needed.' });
    }

    const { customerEmail, amount, merchantRef, id: mayarTransactionId } = data;

    try {
        await db.runTransaction(async (transaction) => {
            const usersRef = db.collection('users');
            const pendingCommissionRef = db.collection('pending_commissions').doc(customerEmail);

            // ▼▼▼ START OF FIX: Get user by UID from merchantRef instead of querying by email ▼▼▼
            const merchantRefParts = merchantRef.split('-');
            const userId = merchantRefParts.length > 1 ? merchantRefParts[1] : null;

            if (!userId) {
                console.error(`FATAL ERROR: Could not extract UID from merchantRef: ${merchantRef}`);
                throw new Error(`Invalid merchantRef format: ${merchantRef}`);
            }

            const userDocRef = usersRef.doc(userId);
            const userDoc = await transaction.get(userDocRef);
            const pendingCommissionDoc = await transaction.get(pendingCommissionRef);
            
            if (!userDoc.exists) {
                console.error(`FATAL ERROR: No user found with UID ${userId}`);
                throw new Error(`User with UID ${userId} not found.`);
            }
            // ▲▲▲ END OF FIX ▲▲▲
            
            const referredByCode = pendingCommissionDoc.exists ? pendingCommissionDoc.data().referredByCode : null;
            let partnerDoc = null;

            if (referredByCode) {
                const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
                const partnerSnapshot = await transaction.get(partnerQuery);
                if (!partnerSnapshot.empty) {
                    partnerDoc = partnerSnapshot.docs[0];
                }
            }

            let plan;
            let commissionAmount = 0;

            // Check payment amount to determine plan type and commission
            if (amount === 250000 || amount === 350000) { // Monthly plan prices
                plan = 'bulanan';
                commissionAmount = 50000;
            } else if (amount === 2500000 || amount === 4200000) { // Yearly plan prices
                plan = 'tahunan';
                commissionAmount = 500000;
            }
            
            const now = new Date();
            let subscriptionEndDate;
            if (plan === 'bulanan') {
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            } else if (plan === 'tahunan') {
                subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
            } else {
                // Fallback to 1 month if plan is not detected
                subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
            }

            // Update the user document directly using the reference we got earlier
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
                console.log(`✅ SUCCESS: Commission of ${commissionAmount} for partner ${partnerId} has been recorded.`);

                transaction.delete(pendingCommissionRef);
                console.log(`INFO: Pending commission data for ${customerEmail} has been deleted.`);
            } else if (referredByCode) {
                console.error(`❌ WARNING: Referral code ${referredByCode} was found, but no matching partner account exists.`);
                transaction.delete(pendingCommissionRef);
            }
        });

        return response.status(200).json({ message: 'Webhook processed successfully.' });

    } catch (error) {
        console.error('FATAL ERROR: Failed to process webhook transaction:', error);
        return response.status(500).json({ message: 'Failed to process webhook', error: error.message });
    }
}
