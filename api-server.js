const express = require('express');
const cors = require('cors');

// [PERBAIKAN KUNCI 1]: Impor file rute Anda dengan benar
const tripayRoutes = require('./api_vps/routes/tripay');
const webhookRoutes = require('./api_vps/routes/webhook');

// Inisialisasi aplikasi Express
const app = express();
const port = 3000;

// Mengaktifkan CORS agar aplikasi Vercel Anda bisa berkomunikasi
app.use(cors({
  origin: 'https://appfashion.id'
}));

// [PERBAIKAN KUNCI 2]: Gunakan app.use() untuk memasang (mount) seluruh router.
// Ini adalah cara yang benar untuk memberitahu Express agar menggunakan "buku menu" yang sudah kita siapkan.
app.use('/api/v1/tripay', tripayRoutes);
app.use('/api/v1/webhook', webhookRoutes);

// Menjalankan server
app.listen(port, () => {
  console.log(`Server API Fashion OS berjalan di http://localhost:${port}`);
});
