import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    console.log('--- LOG: Menerima request dari frontend ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, item_name, customer_email, callback_url, redirect_url, merchant_ref, referredByCode } = req.body;
    
    if (!amount || !item_name || !customer_email || !callback_url || !redirect_url || !merchant_ref) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
    const mayarApiUrl = 'https://api.mayar.club/hl/v1/invoice/create';

    const mayarPayload = {
        name: customer_email.split('@')[0],
        email: customer_email,
        mobile: '081234567890',
        redirect_url: redirect_url,
        callback_url: callback_url,
        description: `Pembayaran untuk ${item_name}`,
        merchant_ref: merchant_ref, // Kita gunakan referensi unik langsung dari frontend
        items: [{
            name: item_name,
            quantity: 1,
            rate: amount,
            description: item_name 
        }],
        metadata: {
            referredByCode: referredByCode || null,
        }
    };

    try {
        console.log('--- LOG: Mengirim payload ke Mayar API ---');
        console.log('Payload:', JSON.stringify(mayarPayload, null, 2));

        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
            headers: {
                'Authorization': `Bearer ${MAYAR_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        // Log jika berhasil
        console.log('✅ BERHASIL: Respons Sukses dari Mayar:', JSON.stringify(mayarResponse.data, null, 2));

        if (mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Respons sukses dari Mayar tetapi tidak berisi link invoice.');
        }

    } catch (error) {
        // ==================================================================
        // <-- BAGIAN UTAMA: LOG DIAGNOSTIK SUPER LENGKAP -->
        // ==================================================================
        console.error('--- ❌ FATAL ERROR SAAT MEMBUAT INVOICE ❌ ---');
        
        if (error.response) {
            // Ini adalah error yang berasal dari respons server Mayar (4xx atau 5xx)
            const errorDetails = {
                message: error.message,
                api_status_code: error.response.status,
                api_status_text: error.response.statusText,
                api_response_body: error.response.data, // INI YANG PALING PENTING
                request_payload_sent: error.config.data ? JSON.parse(error.config.data) : "Tidak dapat membaca payload",
                request_url: error.config.url,
                request_method: error.config.method,
            };
            console.error('Detail Lengkap Error dari API Mayar:');
            console.error(JSON.stringify(errorDetails, null, 2));
            
            return res.status(500).json({ 
                message: 'Gagal membuat invoice Mayar, server Mayar memberikan error.', 
                error: errorDetails 
            });

        } else if (error.request) {
            // Request dibuat tapi tidak ada respons yang diterima
            console.error('Error Jaringan: Tidak ada respons dari server Mayar.');
            console.error(error.request);
            return res.status(500).json({ message: 'Gagal menghubungi server Mayar.' });

        } else {
            // Error lain saat setup request
            console.error('Error Konfigurasi Request:', error.message);
            return res.status(500).json({ message: 'Terjadi error internal sebelum mengirim request.', error: error.message });
        }
    }
}