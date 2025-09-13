import axios from 'axios/dist/node/axios.cjs';

export default async function (req, res) {
    console.log('--- LOG: Menerima request dari frontend ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { amount, item_name, customer_email, callback_url, redirect_url, referredByCode } = req.body;
    
    if (!amount || !item_name || !customer_email || !callback_url || !redirect_url) {
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
                // Buat ID yang selalu unik di setiap percobaan
                const finalMerchantRef = `FASHIONOS-${customer_email}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
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
                if (error.response?.status === 409) {
                    console.error(`❌ PERINGATAN: Error 409 terdeteksi pada percobaan ke-${attempts + 1}. Mencoba lagi...`);
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }
        
        // --- PERBAIKAN: Cek apakah mayarResponse ada sebelum diakses ---
        if (mayarResponse && mayarResponse.data?.data?.link) {
            return res.status(200).json({ invoice_url: mayarResponse.data.data.link });
        } else {
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar setelah beberapa percobaan.');
        }

    } catch (error) {
        console.error('Fatal Error processing webhook:', error.message);
        return res.status(500).json({ message: 'Failed to create Mayar invoice', error: error.response?.data || error.message });
    }
}