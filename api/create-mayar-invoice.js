import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, item_name, customer_email, callback_url, redirect_url, merchant_ref } = req.body;
    
    if (!amount || !item_name || !customer_email || !callback_url || !redirect_url || !merchant_ref) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
    // --- PERUBAHAN UTAMA DI SINI ---
    const mayarApiUrl = 'https://api.mayar.id/hl/v1/invoice/create'; // Menggunakan URL Produksi

    try {
        const mayarPayload = {
            name: customer_email.split('@')[0],
            email: customer_email,
            mobile: '081234567890',
            redirectUrl: redirect_url,
            callbackUrl: callback_url,
            description: `Pembayaran untuk ${item_name}`,
            merchantRef: merchant_ref,
            items: [{
                name: item_name,
                quantity: 1,
                rate: amount,
                description: item_name
            }]
        };

        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
            headers: { 
                'Authorization': `Bearer ${MAYAR_API_KEY ? MAYAR_API_KEY.trim() : ''}`, 
                'Content-Type': 'application/json' 
            },
        });

        if (mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Respons sukses dari Mayar tetapi tidak berisi link invoice.');
        }
    } catch (error) {
        console.error('Fatal Error saat memproses pembuatan invoice:', error.message);
        if (error.response) {
            console.error('Status Error:', error.response.status);
            console.error('Data Error dari Mayar:', JSON.stringify(error.response.data, null, 2));
        }
        return res.status(500).json({ message: 'Gagal membuat invoice Mayar', error: error.response?.data || error.message });
    }
}