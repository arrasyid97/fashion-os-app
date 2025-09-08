// Impor library yang diperlukan
const crypto = require('crypto');
const { db } = require('../firebase.js'); // Pastikan path ke firebase.js benar
const { doc, updateDoc } = require('firebase/firestore');

// Ambil kunci rahasia dari environment variables
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;

export default async function handler(req, res) {
  // 1. Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  // --- Verifikasi Signature Webhook ---
  const signature = req.headers['x-callback-signature'];
  const json_data = JSON.stringify(req.body);

  // Buat signature pembanding menggunakan private key Anda
  const hash = crypto.createHmac('sha256', TRIPAY_PRIVATE_KEY)
                     .update(json_data)
                     .digest('hex');

  if (signature !== hash) {
    console.warn('Signature verification failed. Incoming signature:', signature, 'Generated hash:', hash);
    return res.status(401).json({ success: false, message: 'Unauthorized. Invalid signature.' });
  }

  // --- Proses Data Webhook ---
  const { merchant_ref, status } = req.body;

  // Pastikan status pembayaran adalah 'PAID' (atau 'SETTLEMENT' tergantung konfigurasi Tripay Anda)
  if (status !== 'PAID') {
    return res.status(200).json({ success: true, message: `Skipping processing for status: ${status}` });
  }

  // AMBIL ID USER DARI merchant_ref
  // Asumsi format merchant_ref adalah 'FASHIONOS-USERID-TIMESTAMP'
  const userId = merchant_ref ? merchant_ref.split('-')[1] : null;

  if (!userId) {
    console.error('Failed to extract userId from merchant_ref:', merchant_ref);
    return res.status(400).json({ success: false, message: 'Invalid merchant reference format.' });
  }

  try {
    // --- Update Database Firestore ---
    const userRef = doc(db, 'users', userId);
    
    // Hitung tanggal kedaluwarsa (30 hari dari sekarang)
    const subscriptionEndDate = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

    // **PERBAIKAN UTAMA:** Menghapus 'userData.' agar path data sesuai dengan app.vue
    await updateDoc(userRef, {
      subscriptionStatus: 'active',
      subscriptionEndDate: subscriptionEndDate
    });
    
    console.log(`Successfully updated subscription for user: ${userId}`);
    return res.status(200).json({ success: true, message: 'Webhook received and processed successfully.' });

  } catch (error) {
    console.error(`Error processing webhook for user: ${userId}`, error);
    // Jika terjadi error, kirim status 500 agar Tripay mencoba mengirim ulang webhook nanti.
    return res.status(500).json({ success: false, message: 'Internal Server Error during database update.' });
  }
}