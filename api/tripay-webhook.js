import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: false,
    },
};

// Fungsi inisialisasi yang aman
function initializeFirebaseAdmin() {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        console.error("FATAL: Kredensial Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON) tidak ditemukan.");
        throw new Error("Kredensial Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON) tidak ditemukan di Environment Variables Vercel.");
    }

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
        console.log("Firebase Admin SDK diinisialisasi.");
    }
    return getFirestore();
}

const db = initializeFirebaseAdmin();

async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    console.log("--- Webhook Diterima ---");

    if (req.method !== 'POST') {
        console.log("Metode ditolak:", req.method);
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const privateKey = process.env.TRIPAY_PRIVATE_KEY;
        const callbackSignature = req.headers['x-callback-signature'];
        
        if (!privateKey || !callbackSignature) {
            console.error("FATAL: Private Key atau Callback Signature tidak ada.");
            return res.status(400).json({ success: false, message: 'Konfigurasi server tidak lengkap.' });
        }
        
        const rawBody = await getRawBody(req);
        console.log("Membaca raw body, panjang:", rawBody.length);

        const signature = crypto.createHmac('sha256', privateKey)
                                .update(rawBody)
                                .digest('hex');
        
        console.log("Signature Dihitung:", signature);
        console.log("Signature Diterima:", callbackSignature);

        if (signature !== callbackSignature) {
            console.error("Signature tidak valid!");
            return res.status(401).json({ success: false, message: 'Invalid Signature' });
        }
        console.log("✅ Signature valid.");

        const data = JSON.parse(rawBody.toString());
        console.log("Data callback diproses:", data);

        if (data.status === 'PAID') {
            console.log("Status pembayaran adalah PAID. Memulai update database...");

            const externalId = data.merchant_ref;
            const parts = externalId.split('-');
            
            console.log("Mem-parsing merchant_ref:", externalId);

            if (parts.length < 3 || parts[0] !== 'FASHIONOS') {
                throw new Error(`Format merchant_ref tidak valid: ${externalId}`);
            }

            const userId = parts[1];
            const planType = parts.length > 3 ? parts[3] : 'bulanan'; // Default ke bulanan
            console.log(`UserID terdeteksi: ${userId}, Tipe Paket: ${planType}`);

            const userRef = db.collection('users').doc(userId);

            const now = new Date();
            let subscriptionEndDate;

            if (planType === 'tahunan') {
                subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 1));
                console.log("Menghitung tanggal akhir untuk 1 tahun:", subscriptionEndDate);
            } else {
                subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
                console.log("Menghitung tanggal akhir untuk 1 bulan:", subscriptionEndDate);
            }

            console.log(`Akan mengupdate Firestore untuk user: ${userId}`);
            await userRef.set({
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                trialEndDate: null
            }, { merge: true });

            console.log("✅ Update Firestore BERHASIL.");
        } else {
            console.log(`Status pembayaran adalah ${data.status}, tidak ada tindakan yang diambil.`);
        }

        console.log("Mengirim respons sukses ke Tripay.");
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('--- !!! ERROR DI DALAM WEBHOOK !!! ---');
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}