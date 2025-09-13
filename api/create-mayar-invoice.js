import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    console.log('--- LOG: Menerima request dari frontend ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // <-- PERBAIKAN: merchant_ref sekarang diambil dari body untuk konsistensi -->
    const { amount, item_name, customer_email, callback_url, redirect_url, merchant_ref, referredByCode } = req.body;
    
    if (!amount || !item_name || !customer_email || !callback_url || !redirect_url || !merchant_ref) {
        return res.status(400).json({ message: 'Missing required fields, including merchant_ref' });
    }

    const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
    const mayarApiUrl = 'https://api.mayar.club/hl/v1/invoice/create';

    let mayarResponse;
    let attempts = 0;
    const maxAttempts = 3;

    try {
        while (attempts < maxAttempts) {
            try {
                // <-- PERBAIKAN: Payload disederhanakan dan diperbaiki -->
                const mayarPayload = {
                    name: customer_email, // Gunakan email sebagai nama customer
                    email: customer_email,
                    redirectUrl: redirect_url,
                    callbackUrl: callback_url,
                    description: `Pembayaran untuk ${item_name}`, // Deskripsi umum
                    merchant_ref: `${merchant_ref}-${attempts}`, // <-- PERBAIKAN: Tambahkan counter percobaan untuk memastikan keunikan absolut
                    items: [{
                        quantity: 1,
                        rate: amount,
                        description: item_name // <-- PERBAIKAN: Deskripsi item dibuat statis dan jelas
                    }],
                    metadata: {
                        referredByCode: referredByCode || null,
                    }
                };
                
                console.log(`--- LOG: Mengirim payload ke Mayar API (Percobaan ke-${attempts + 1}) ---`);
                console.log('Payload:', JSON.stringify(mayarPayload, null, 2));

                mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
                    headers: {
                        'Authorization': `Bearer ${MAYAR_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                });

                // Jika berhasil, keluar dari loop
                break; 

            } catch (error) {
                if (error.response?.status === 409) {
                    console.error(`❌ PERINGATAN: Error 409 terdeteksi pada percobaan ke-${attempts + 1}. Mencoba lagi...`);
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 500)); // Jeda sebelum mencoba lagi
                } else {
                    // Lemparkan error lain untuk ditangkap di luar loop
                    throw error;
                }
            }
        }
        
        // <-- PERBAIKAN: Penanganan error jika semua percobaan gagal -->
        if (!mayarResponse) {
             throw new Error('Gagal membuat invoice di Mayar setelah beberapa kali percobaan karena konflik (Error 409).');
        }

        if (mayarResponse.data?.data?.link) {
            console.log('✅ BERHASIL: Invoice URL diterima dari Mayar:', mayarResponse.data.data.link);
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            // Tangani jika respons 200 tapi tidak ada link
            throw new Error('Respons dari Mayar tidak valid atau tidak berisi link invoice.');
        }

    } catch (error) {
        console.error('Fatal Error saat memproses pembuatan invoice:', error.message);
        return res.status(500).json({ message: 'Gagal membuat invoice Mayar', error: error.response?.data || error.message });
    }
}