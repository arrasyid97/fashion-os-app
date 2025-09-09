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
        
        // 1. Baca dan Verifikasi Signature
        const rawBody = await getRawBody(req);
        const signature = crypto.createHmac('sha256', privateKey)
                                .update(rawBody)
                                .digest('hex');

        if (signature !== callbackSignature) {
            return res.status(401).json({ success: false, message: 'Invalid Signature' });
        }

        // 2. Proses Notifikasi jika Signature Valid
        const data = JSON.parse(rawBody.toString());

        if (data.status === 'PAID') {
            const externalId = data.merchant_ref; // 'FASHIONOS-UIDLENGKAP-TIMESTAMP'
            const parts = externalId.split('-');
            
            if (parts.length < 2 || parts[0] !== 'FASHIONOS') {
                throw new Error('Format merchant_ref tidak valid');
            }

            const userId = parts[1]; // Mengambil UID lengkap dari merchant_ref
            const userRef = db.collection('users').doc(userId);

            // Tentukan tanggal berakhirnya langganan (30 hari dari sekarang)
            const now = new Date();
            const subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));

            // 3. Update Database Firestore
            await userRef.update({
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate,
                trialEndDate: null // Hapus tanggal trial jika ada
            });
        }

        // 4. Kirim Respons Sukses ke Tripay
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook Error:', error.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
    

