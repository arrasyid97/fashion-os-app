import crypto from 'crypto';
import axios from 'axios';
import { ProxyAgent } from 'proxy-agent';

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
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        // Menggunakan ProxyAgent yang lebih andal dari 'proxy-agent'
        if (process.env.STATIC_IP_PROXY_URL) {
            const proxyAgent = new ProxyAgent(process.env.STATIC_IP_PROXY_URL);
            config.httpAgent = proxyAgent;
            config.httpsAgent = proxyAgent;
            console.log('Menggunakan proxy statis:', process.env.STATIC_IP_PROXY_URL);
        }

        const response = await axios.post('https://tripay.co.id/api/transaction/create', data, config);

        if (response.status === 200 && response.data.success) {
            return res.status(200).json({ payment_url: response.data.data.checkout_url });
        } else {
            console.error('Gagal membuat invoice Tripay:', response.data.message);
            return res.status(response.status).json({ message: 'Tripay Error', error: response.data.message });
        }

    } catch (error) {
        console.error('Kesalahan dalam API Tripay:', error.response ? error.response.data : error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}