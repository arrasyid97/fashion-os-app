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

    let mayarResponse;
    let attempts = 0;
    const maxAttempts = 3;

    try {
        while (attempts < maxAttempts) {
            try {
                const mayarPayload = {
                    name: customer_email,
                    email: customer_email,
                    redirect_url: redirect_url,           // <-- PERBAIKAN: Menggunakan snake_case
                    callback_url: callback_url,           // <-- PERBAIKAN: Menggunakan snake_case
                    description: `Pembayaran untuk ${item_name}`,
                    merchant_ref: `${merchant_ref}-${attempts}`,
                    items: [{
                        name: item_name,                  // <-- PERBAIKAN: Menggunakan 'name' untuk item
                        quantity: 1,
                        rate: amount
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

                break; 

            } catch (error) {
                if (error.response?.status === 409) {
                    console.error(`❌ PERINGATAN: Error 409 terdeteksi pada percobaan ke-${attempts + 1}. Mencoba lagi...`);
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    throw error;
                }
            }
        }
        
        if (!mayarResponse) {
             throw new Error('Gagal membuat invoice di Mayar setelah beberapa kali percobaan karena konflik (Error 409).');
        }

        if (mayarResponse.data?.data?.link) {
            console.log('✅ BERHASIL: Invoice URL diterima dari Mayar:', mayarResponse.data.data.link);
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Respons dari Mayar tidak valid atau tidak berisi link invoice.');
        }

    } catch (error) {
        console.error('Fatal Error saat memproses pembuatan invoice:', error.message);
        return res.status(500).json({ message: 'Gagal membuat invoice Mayar', error: error.response?.data || error.message });
    }
}