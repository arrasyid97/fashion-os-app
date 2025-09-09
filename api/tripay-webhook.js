import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: false,
    },
};

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Kredensial Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON) tidak ditemukan di Environment Variables Vercel.");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const privateKey = process.env.TRIPAY_PRIVATE_KEY;
        const callbackSignature = req.headers['x-callback-signature'];
        
        const rawBody = await getRawBody(req);
        
        // --- [PERBAIKAN KUNCI DI SINI] ---
        // Mengubah 'sha265' yang salah menjadi 'sha256' yang benar
        const signature = crypto.createHmac('sha256', privateKey)
                                .update(rawBody)
                                .digest('hex');
        // --- [AKHIR PERBAIKAN] ---

        if (signature !== callbackSignature) {
            return res.status(401).json({ success: false, message: 'Invalid Signature' });
        }

        const data = JSON.parse(rawBody.toString());

        if (data.status === 'PAID') {
            const externalId = data.merchant_ref;
            const parts = externalId.split('-');
            
            if (parts.length < 4 || parts[0] !== 'FASHIONOS') { 
                throw new Error('Format merchant_ref tidak valid atau tidak lengkap');
            }

            const userId = parts[1];
            const planType = parts[3];
            const userRef = db.collection('users').doc(userId);

            const now = new Date();
            let subscriptionEndDate;

            if (planType === 'tahunan') {
                subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 1));
            } else {
                subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
            }

            await userRef.set({
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                trialEndDate: null
            }, { merge: true });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook Error:', error.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}