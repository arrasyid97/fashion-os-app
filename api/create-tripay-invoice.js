import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
const crypto = require('crypto');

// Mengambil URL proxy dari Environment Variable yang sudah kita atur
const PROXY_URL = process.env.STATIC_IP_PROXY_URL;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, externalId, payerEmail, description } = req.body;

    try {
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
            signature: crypto.createHmac('sha256', process.env.TRIPAY_PRIVATE_KEY)
                            .update(process.env.TRIPAY_MERCHANT_CODE + externalId + String(amount))
                            .digest('hex')
        };

        // Membuat agen proxy HANYA jika PROXY_URL ada
        const httpsAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

        // Konfigurasi untuk permintaan Axios
        const config = {
            headers: {
                'Authorization': 'Bearer ' + process.env.TRIPAY_API_KEY,
            },
            // Memberitahu Axios untuk menggunakan agen proxy kita
            httpsAgent: httpsAgent
        };

        // Mengirim permintaan menggunakan Axios
        const response = await axios.post('[https://tripay.co.id/api/transaction/create](https://tripay.co.id/api/transaction/create)', data, config);
        const result = response.data; // Di Axios, data respons ada di dalam `response.data`

        if (result.success) {
            return res.status(200).json({ payment_url: result.data.checkout_url });
        } else {
            console.error('Error creating Tripay invoice:', result.message);
            return res.status(500).json({ message: 'Tripay Error', error: result.message });
        }

    } catch (error) {
        if (error.response) {
            // Menangkap error spesifik dari API Tripay
            console.error('Axios error response:', error.response.data);
            return res.status(500).json({ message: 'Tripay Error', error: error.response.data.message });
        } else {
            // Menangkap error jaringan atau lainnya
            console.error('Error in Tripay API call:', error.message);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }
}