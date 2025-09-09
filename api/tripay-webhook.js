import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Konfigurasi untuk menonaktifkan body parser default Vercel
// Ini PENTING agar kita bisa memverifikasi signature dari Tripay
export const config = {
    api: {
        bodyParser: false,
    },
};

// Inisialisasi Firebase Admin SDK
// Mengambil kredensial dari Vercel Environment Variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Kredensial Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON) tidak ditemukan di Environment Variables Vercel.");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

// Cek apakah aplikasi sudah diinisialisasi untuk menghindari error duplikat
if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();

// Fungsi untuk membaca raw body dari request
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
        const signature = crypto.createHmac('sha265', privateKey)
                                .update(rawBody)
                                .digest('hex');

        if (signature !== callbackSignature) {
            return res.status(401).json({ success: false, message: 'Invalid Signature' });
        }

        const data = JSON.parse(rawBody.toString());

        if (data.status === 'PAID') {
            const externalId = data.merchant_ref; // Format: FASHIONOS-UID-TIMESTAMP-PLAN
            const parts = externalId.split('-');
            
            // Sekarang harus ada 4 bagian: FASHIONOS, UID, Timestamp, Plan
            if (parts.length < 4 || parts[0] !== 'FASHIONOS') { 
                throw new Error('Format merchant_ref tidak valid atau tidak lengkap');
            }

            const userId = parts[1];
            const planType = parts[3]; // Mengambil "memo" jenis paket
            const userRef = db.collection('users').doc(userId);

            const now = new Date();
            let subscriptionEndDate;

            // --- [PERBAIKAN KUNCI DI SINI] ---
            // Logika untuk menentukan durasi langganan berdasarkan "memo"
            if (planType === 'tahunan') {
                // Jika paket tahunan, tambahkan 1 tahun
                subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 1));
            } else {
                // Jika paket bulanan (atau jika tidak terdefinisi), tambahkan 1 bulan
                subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
            }
            // --- [AKHIR PERBAIKAN] ---

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