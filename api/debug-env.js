// File ini hanya untuk tujuan debugging.
// WAJIB HAPUS file ini setelah masalah Environment Variable teratasi.

export default function handler(req, res) {
  try {
    // Menyaring variabel agar tidak menampilkan semua detail yang tidak relevan
    // dan menyembunyikan nilai rahasia.
    const relevantEnv = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      
      TRIPAY_API_KEY: process.env.TRIPAY_API_KEY 
        ? '*** Ditemukan ***' 
        : '!!! TIDAK DITEMUKAN !!!',
        
      TRIPAY_PRIVATE_KEY: process.env.TRIPAY_PRIVATE_KEY 
        ? '*** Ditemukan ***' 
        : '!!! TIDAK DITEMUKAN !!!',
        
      TRIPAY_MERCHANT_CODE: process.env.TRIPAY_MERCHANT_CODE 
        ? '*** Ditemukan ***' 
        : '!!! TIDAK DITEMUKAN !!!',
        
      PROXYLITE_URL: process.env.PROXYLITE_URL 
        ? '*** Ditemukan ***' 
        : '!!! TIDAK DITEMUKAN !!!',
      
      // Variabel yang paling penting kita periksa:
      FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON 
        ? '*** Ditemukan dan BERISI ***' 
        : '!!! TIDAK DITEMUKAN !!!',
      
      // Menampilkan beberapa karakter pertama untuk verifikasi, tapi menyembunyikan sisanya
      FIREBASE_SERVICE_ACCOUNT_JSON_PREVIEW: process.env.FIREBASE_SERVICE_ACCOUNT_JSON 
        ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON.substring(0, 50) + '...'
        : '!!! TIDAK DITEMUKAN !!!'
    };

    // Mengirimkan hasil sebagai JSON yang mudah dibaca di browser
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(relevantEnv, null, 2));

  } catch (error) {
    res.status(500).json({ error: 'Gagal membaca environment variables', message: error.message });
  }
}