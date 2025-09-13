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

    try {
        // Hanya satu kali percobaan untuk melihat error yang jelas
        const mayarPayload = {
            name: customer_email.split('@')[0], // <-- PERBAIKAN: Gunakan bagian depan email sebagai nama
            email: customer_email,
            mobile: '081234567890',          // <-- PERBAIKAN FINAL: Menambahkan kembali field 'mobile' yang kemungkinan wajib
            redirect_url: redirect_url,
            callback_url: callback_url,
            description: `Pembayaran untuk ${item_name}`,
            merchant_ref: merchant_ref, // <-- PERBAIKAN: Gunakan merchant_ref asli tanpa tambahan, karena sudah unik dari frontend
            items: [{
                name: item_name,
                quantity: 1,
                rate: amount
            }],
            metadata: {
                referredByCode: referredByCode || null,
            }
        };
        
        console.log(`--- LOG: Mengirim payload ke Mayar API ---`);
        console.log('Payload:', JSON.stringify(mayarPayload, null, 2));

        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
            headers: {
                'Authorization': `Bearer ${MAYAR_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (mayarResponse.data?.data?.link) {
            console.log('✅ BERHASIL: Invoice URL diterima dari Mayar:', mayarResponse.data.data.link);
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Respons dari Mayar tidak valid atau tidak berisi link invoice.');
        }

    } catch (error) {
        console.error('Fatal Error saat memproses pembuatan invoice:', error.message);
        // <-- PERBAIKAN: Tampilkan juga detail error dari respons Mayar jika ada -->
        console.error('Mayar Error Response:', JSON.stringify(error.response?.data, null, 2));
        return res.status(500).json({ message: 'Gagal membuat invoice Mayar', error: error.response?.data || error.message });
    }
}