import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: false,
    },
};

// --- [PERBAIKAN KUNCI: Validasi Environment Variable] ---
// Memastikan variabel ada sebelum digunakan untuk mencegah error JSON.parse
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Memberikan pesan error yang jelas jika variabel tidak ditemukan
    throw new Error("Kredensial Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON) tidak ditemukan di Environment Variables Vercel.");
}
// -----------------------------------------------------------

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
        const signature = crypto.createHmac('sha256', privateKey)
                                .update(rawBody)
                                .digest('hex');

        if (signature !== callbackSignature) {
            return res.status(401).json({ success: false, message: 'Invalid Signature' });
        }

        const data = JSON.parse(rawBody.toString());

        if (data.status === 'PAID') {
            const externalId = data.merchant_ref;
            const parts = externalId.split('-');
            
            if (parts.length < 2 || parts[0] !== 'FASHIONOS') {
                throw new Error('Format merchant_ref tidak valid');
            }

            const userId = parts[1];
            const userRef = db.collection('users').doc(userId);

            const now = new Date();
            const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));

            await userRef.update({
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                trialEndDate: null
            });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook Error:', error.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}