import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    console.log('--- LOG: Menerima request dari frontend ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { amount, item_name, customer_email, callback_url, redirect_url, referredByCode, merchant_ref } = req.body;
        
        // --- BUAT LOGIKA PERULANGAN UNTUK MENGULANG PERMINTAAN ---
        let mayarResponse;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                // Buat ID yang selalu unik di setiap percobaan
                const finalMerchantRef = `${merchant_ref}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
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
                // Jika error adalah 409 (already exist), coba lagi
                if (error.response?.status === 409) {
                    console.error(`❌ PERINGATAN: Error 409 terdeteksi pada percobaan ke-${attempts + 1}. Mencoba lagi...`);
                    attempts++;
                    // Jeda sebentar sebelum mencoba lagi
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    // Jika error bukan 409, lempar error
                    throw error;
                }
            }
        }
        
        if (mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar setelah beberapa percobaan.');
        }

    } catch (error) {
        console.error('Fatal Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to create Mayar invoice', error: error.response?.data || error.message });
    }
}