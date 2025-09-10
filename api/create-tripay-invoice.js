const https = require('https');
const crypto = require('crypto');

function handler(req, res) {
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

        const postData = JSON.stringify({
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
        });

        const options = {
            hostname: 'tripay.co.id',
            path: '/api/transaction/create',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const apiRequest = https.request(options, (apiResponse) => {
            let data = '';
            apiResponse.on('data', (chunk) => {
                data += chunk;
            });
            apiResponse.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (apiResponse.statusCode === 200 && result.success) {
                        return res.status(200).json({ payment_url: result.data.checkout_url });
                    } else {
                        console.error('Gagal membuat invoice Tripay:', result.message);
                        return res.status(apiResponse.statusCode).json({ message: 'Tripay Error', error: result.message });
                    }
                } catch (e) {
                    console.error('Kesalahan dalam respons Tripay:', e.message);
                    return res.status(500).json({ message: 'Internal Server Error', error: e.message });
                }
            });
        });

        apiRequest.on('error', (error) => {
            console.error('Kesalahan dalam permintaan API:', error.message);
            return res.status(500).json({ message: 'Internal Server Error', error: error.message });
        });

        apiRequest.write(postData);
        apiRequest.end();

    } catch (error) {
        console.error('Kesalahan umum:', error.message);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

module.exports = {
  default: handler,
};
