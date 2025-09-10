import axios from 'axios';
// --- [PERBAIKAN KUNCI 1: Mengimpor alat yang benar] ---
import { SocksProxyAgent } from 'socks-proxy-agent';
import crypto from 'crypto';

// Mengambil URL proxy dari Vercel Environment Variable
const PROXY_URL = process.env.STATIC_IP_PROXY_URL;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, externalId, payerEmail, description } = req.body;
    const apiKey = process.env.TRIPAY_API_KEY;
    const privateKey = process.env.TRIPAY_PRIVATE_KEY;
    const merchantCode = process.env.TRIPAY_MERCHANT_CODE;

    if (!apiKey || !privateKey || !merchantCode || !PROXY_URL) {
        console.error("Salah satu environment variable penting tidak ditemukan.");
        return res.status(500).json({ message: "Konfigurasi server tidak lengkap." });
    }

    try {
        const signature = crypto.createHmac('sha256', privateKey)
                                .update(merchantCode + externalId + String(amount))
                                .digest('hex');

        const data = {
            method: 'BRIVA',
            merchant_ref: externalId,
            amount: amount,
            customer_name: 'Pelanggan',
            customer_email: payerEmail,
            order_items: [{
                price: amount,
                quantity: 1,
                name: description,
            }],
            return_url: `https://appfashion.id/langganan?status=success`,
            expired_time: Math.round((Date.now() / 1000) + (24 * 60 * 60)),
            signature: signature
        };

        const axiosConfig = {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            // --- [PERBAIKAN KUNCI 2: Menggunakan alat yang benar] ---
            httpsAgent: new SocksProxyAgent(PROXY_URL)
        };

        const response = await axios.post('[https://tripay.co.id/api/transaction/create](https://tripay.co.id/api/transaction/create)', data, axiosConfig);
        const result = response.data;

        if (result.success) {
            return res.status(200).json({ payment_url: result.data.checkout_url });
        } else {
            console.error('Error dari Tripay:', result.message);
            return res.status(500).json({ message: 'Tripay Error', error: result.message });
        }

    } catch (error) {
        console.error('Error di dalam API:', error.response ? error.response.data : error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}