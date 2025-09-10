import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { request } from 'undici';

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

        const proxyAgent = process.env.STATIC_IP_PROXY_URL ? new HttpsProxyAgent(process.env.STATIC_IP_PROXY_URL) : undefined;

        // Menggunakan undici.request sebagai pengganti fetch
        const { body, statusCode } = await request('https://tripay.co.id/api/transaction/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            // undici menggunakan 'dispatcher' untuk agent
            dispatcher: proxyAgent,
        });

        const result = await body.json();

        if (statusCode >= 200 && statusCode < 300 && result.success) {
            return res.status(200).json({ payment_url: result.data.checkout_url });
        } else {
            console.error('Error creating Tripay invoice:', result.message);
            return res.status(statusCode).json({ message: 'Tripay Error', error: result.message });
        }

    } catch (error) {
        console.error('Error in Tripay API:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}