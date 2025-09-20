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
    const mayarApiUrl = 'https://api.mayar.club/hl/v1/invoice/create';

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

        // --- BLOK LOGGING BARU DIMULAI ---
        const trimmedApiKey = MAYAR_API_KEY ? MAYAR_API_KEY.trim() : '';
        
        const requestConfig = {
            headers: {
                'Authorization': `Bearer ${trimmedApiKey}`,
                'Content-Type': 'application/json'
            }
        };

        console.log('--- MEMULAI PROSES DIAGNOSIS REQUEST KE MAYAR ---');
        console.log('Metode:', 'POST');
        console.log('URL Tujuan:', mayarApiUrl);
        console.log('Header Otorisasi (Format):', requestConfig.headers.Authorization ? `Bearer [${requestConfig.headers.Authorization.substring(7, 12)}...${requestConfig.headers.Authorization.slice(-5)}]` : 'Header Otorisasi TIDAK ADA');
        console.log('Payload Body:', JSON.stringify(mayarPayload));
        console.log('--- AKHIR DARI DIAGNOSIS ---');
        // --- BLOK LOGGING BARU SELESAI ---

        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, requestConfig);

        if (mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Respons sukses dari Mayar tetapi tidak berisi link invoice.');
        }
    } catch (error) {
        console.error('--- ERROR TERJADI SAAT REQUEST ---');
        console.error('Pesan Error Axios:', error.message);
        if (error.response) {
            console.error('Status Error:', error.response.status);
            console.error('Data Error dari Mayar:', JSON.stringify(error.response.data, null, 2));
        }
        return res.status(500).json({ message: 'Gagal membuat invoice Mayar', error: error.response?.data || error.message });
    }
}