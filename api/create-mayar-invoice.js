import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { amount, item_name, customer_email, callback_url, redirect_url, referredByCode } = req.body;
        
        // --- PERBAIKAN: merchant_ref dibuat unik di sini ---
        const uniqueMerchantRef = `FASHIONOS-${customer_email}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

        if (!amount || !item_name || !customer_email || !callback_url || !redirect_url) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
        const mayarApiUrl = 'https://api.mayar.club/hl/v1/invoice/create';

        const mayarPayload = {
            name: 'Customer Name',
            email: customer_email,
            mobile: '081234567890',
            redirectUrl: redirect_url,
            callbackUrl: callback_url,
            description: item_name,
            merchant_ref: uniqueMerchantRef, // Menggunakan merchant_ref yang sudah unik
            items: [{
                quantity: 1,
                rate: amount,
                description: item_name
            }],
            metadata: {
                referredByCode: referredByCode || null
            }
        };

        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
            headers: {
                'Authorization': `Bearer ${MAYAR_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar.');
        }

    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            console.error('Error DNS: Tidak dapat menemukan domain API Mayar. Pastikan URL sudah benar.');
            return res.status(503).json({ message: 'Layanan Mayar tidak dapat dijangkau.', error: error.message });
        }
        
        console.error('Error creating Mayar invoice:', error.response?.data || error.message);
        return res.status(500).json({ message: 'Failed to create Mayar invoice', error: error.response?.data || error.message });
    }
}