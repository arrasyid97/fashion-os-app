const { Xendit } = require('xendit-node');

// Inisialisasi Xendit dengan Secret Key dari Vercel Environment Variables
const x = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

// Perhatikan: Tidak ada lagi "new Invoice({})" di sini

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId, email } = req.body; // Ambil juga email dari frontend

    let amount = 0;
    let description = '';

    if (plan === 'bulanan') {
      amount = 50000;
      description = 'Langganan Fashion OS Paket Bulanan';
    } else if (plan === 'tahunan') {
      amount = 500000;
      description = 'Langganan Fashion OS Paket Tahunan';
    } else {
      return res.status(400).json({ error: 'Paket tidak valid.' });
    }

    // --- INI BAGIAN YANG DIPERBAIKI ---
    // Panggil createInvoice langsung dari instance 'x.Invoice'
    const invoice = await x.Invoice.createInvoice({
      externalID: `FASHION-OS-${userId}-${Date.now()}`,
      amount: amount,
      description: description,
      payerEmail: email, // Gunakan email pengguna yang login
      successRedirectURL: 'https://fashion-os-app.vercel.app/payment-success', // Pastikan ini halaman yg ada
      failureRedirectURL: 'https://fashion-os-app.vercel.app/payment-failed', // Pastikan ini halaman yg ada
    });
    // ---------------------------------

    res.status(200).json({ paymentUrl: invoice.invoiceUrl });

  } catch (error) {
    console.error('Error creating Xendit invoice:', error);
    res.status(500).json({ error: 'Gagal membuat invoice pembayaran.', details: error.message });
  }
}