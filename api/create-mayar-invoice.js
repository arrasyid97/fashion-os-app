import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    // --- LOG: Request Diterima dari Frontend ---
    console.log('--- LOG INI ADALAH PAYLOAD DARI FRONTEND KE BACKEND API ---');
    console.log('Waktu Request:', new Date().toISOString());
    console.log('Metode:', req.method);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('----------------------------------------------------');

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { amount, item_name, customer_email, callback_url, redirect_url, referredByCode, merchant_ref } = req.body;
        
        // --- BUAT ID UNIK DI BACKEND SEBAGAI SOLUSI KONTRA-LOGIKA ---
        const finalMerchantRef = `FASHIONOS-Ref-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        if (!amount || !item_name || !customer_email || !callback_url || !redirect_url) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
        const mayarApiUrl = 'https://api.mayar.club/hl/v1/invoice/create';
        
        const uniqueDescription = `${item_name} (Ref: ${finalMerchantRef})`;

        const mayarPayload = {
            name: 'Customer Name',
            email: customer_email,
            mobile: '081234567890',
            redirectUrl: redirect_url,
            callbackUrl: callback_url,
            description: uniqueDescription,
            merchant_ref: finalMerchantRef,
            items: [{
                quantity: 1,
                rate: amount,
                description: uniqueDescription
            }],
            metadata: {
                referredByCode: referredByCode || null,
            }
        };
        
        // --- LOG: Payload yang Akan Dikirim ke Mayar API ---
        console.log('--- LOG INI ADALAH PAYLOAD DARI BACKEND KE MAYAR API ---');
        console.log('Mayar API URL:', mayarApiUrl);
        console.log('Payload:', JSON.stringify(mayarPayload, null, 2));
        console.log('----------------------------------------------------');

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
        // --- LOG: Menganalisis Error dari Mayar ---
        console.log('--- LOG INI ADALAH ANALISIS ERROR DARI MAYAR ---');
        if (error.response) {
            console.error('Status Code:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error Message:', error.message);
        }
        console.log('----------------------------------------------------');

        if (error.code === 'ENOTFOUND') {
            return res.status(503).json({ message: 'Layanan Mayar tidak dapat dijangkau.', error: error.message });
        }
        
        return res.status(500).json({ message: 'Failed to create Mayar invoice', error: error.response?.data || error.message });
    }
}