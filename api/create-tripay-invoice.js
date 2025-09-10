import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import crypto from 'crypto';

const PROXY_URL = process.env.STATIC_IP_PROXY_URL;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, externalId, payerEmail, description } = req.body;
    const apiKey = process.env.TRIPAY_API_KEY;
    const privateKey = process.env.TRIPAY_PRIVATE_KEY;
    const merchantCode = process.env.TRIPAY_MERCHANT_CODE;

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
            return_url: `${req.headers.origin}/langganan?status=success`,
            expired_time: Math.round((Date.now() / 1000) + (24 * 60 * 60)),
            signature: signature
        };

        // --- [PERBAIKAN KUNCI DI SINI] ---
        // Konfigurasi untuk axios
        const axiosConfig = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            // Memberitahu axios untuk menggunakan agen proxy jika URL-nya ada
            ...(PROXY_URL && { httpsAgent: new HttpsProxyAgent(PROXY_URL) })
        };

        // Menggunakan axios.post bukan fetch
        const response = await axios.post('[https://tripay.co.id/api/transaction/create](https://tripay.co.id/api/transaction/create)', data, axiosConfig);
        const result = response.data;
        // --- [AKHIR PERBAIKAN] ---

        if (result.success) {
            return res.status(200).json({ payment_url: result.data.checkout_url });
        } else {
            console.error('Error creating Tripay invoice:', result.message);
            return res.status(500).json({ message: 'Tripay Error', error: result.message });
        }

    } catch (error) {
        // Axios memberikan detail error yang lebih baik
        console.error('Error in Tripay API:', error.response ? error.response.data : error.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}