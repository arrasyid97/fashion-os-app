// Mengimpor library yang dibutuhkan
import axios from 'axios/dist/node/axios.cjs';

// Ini adalah fungsi utama yang akan dieksekusi oleh Vercel.
export default async function (req, res) {
    // Memastikan request yang masuk adalah metode POST.
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // Mendapatkan data dari body request yang dikirim dari App.vue.
        const { amount, item_name, customer_email, callback_url, redirect_url, merchant_ref } = req.body;
        
        // Memastikan semua data yang diperlukan sudah lengkap.
        if (!amount || !item_name || !customer_email || !callback_url || !redirect_url || !merchant_ref) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Mengambil MAYAR_API_KEY dari Environment Variables Vercel.
        // Ini adalah cara yang aman untuk menggunakan kunci rahasia.
        const MAYAR_API_KEY = process.env.MAYAR_API_KEY;

        // Endpoint API Mayar untuk membuat tagihan.
        const mayarApiUrl = 'https://my.mayar.cloud/api/resource/invoice';
        
        // Data yang akan dikirim ke API Mayar.
        const mayarPayload = {
            amount,
            item_name,
            customer_email,
            callback_url,
            redirect_url,
            merchant_ref,
            // Tambahkan field lain yang mungkin dibutuhkan, seperti 'currency': 'IDR'
        };

        // Mengirim request ke API Mayar.
        const mayarResponse = await axios.post(mayarApiUrl, mayarPayload, {
            headers: {
                'Authorization': `Bearer ${MAYAR_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        // Mengirim kembali URL pembayaran dari Mayar ke aplikasi Anda.
        return res.status(200).json({ invoice_url: mayarResponse.data.data.invoice_url });

    } catch (error) {
        // Penanganan error yang lebih baik
        if (error.code === 'ENOTFOUND') {
            console.error('Error DNS: Tidak dapat menemukan domain my.mayar.cloud. Pastikan URL API Mayar sudah benar.');
            return res.status(503).json({ message: 'Layanan Mayar tidak dapat dijangkau.', error: error.message });
        }
        
        console.error('Error creating Mayar invoice:', error.response?.data || error.message);
        return res.status(500).json({ message: 'Failed to create Mayar invoice', error: error.message });
    }
}