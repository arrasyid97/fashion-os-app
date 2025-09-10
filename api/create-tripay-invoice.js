import crypto from 'crypto';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

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

        const config = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
        };

        // Menggunakan SocksProxyAgent untuk node-fetch jika proksi tersedia
        if (process.env.STATIC_IP_PROXY_URL) {
            config.agent = new SocksProxyAgent(process.env.STATIC_IP_PROXY_URL);
            console.log('Menggunakan proxy statis:', process.env.STATIC_IP_PROXY_URL);
        }

        const response = await fetch('https://tripay.co.id/api/transaction/create', config);
        const result = await response.json();

        if (response.ok && result.success) {
            return res.status(200).json({ payment_url: result.data.checkout_url });
        } else {
            console.error('Gagal membuat invoice Tripay:', result.message);
            return res.status(response.status).json({ message: 'Tripay Error', error: result.message });
        }
    } catch (error) {
        console.error('Kesalahan dalam API Tripay:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}