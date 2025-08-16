const { Xendit } = require('xendit-node');

// Inisialisasi Xendit dengan Secret Key dari Vercel Environment Variables
const x = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

const { Invoice } = x;
const i = new Invoice({});

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId } = req.body;

    // Tentukan harga berdasarkan paket yang dipilih
    let amount = 0;
    if (plan === 'bulanan') {
      amount = 50000;
    } else if (plan === 'tahunan') {
      amount = 500000;
    } else {
      return res.status(400).json({ error: 'Paket tidak valid.' });
    }

    const invoice = await i.createInvoice({
      externalID: `FASHION-OS-${userId}-${Date.now()}`,
      amount: amount,
      description: `Langganan Fashion OS Paket ${plan}`,
      // Ganti dengan email pengguna jika ada
      payerEmail: 'user@example.com', 
      // Ganti URL ini dengan domain Vercel Anda yang sebenarnya
      successRedirectURL: 'https://fashion-os-app.vercel.app/payment-success',
      failureRedirectURL: 'https://fashion-os-app.vercel.app/payment-failed',
    });

    // Kirim kembali URL invoice ke frontend
    res.status(200).json({ paymentUrl: invoice.invoiceUrl });

  } catch (error) {
    console.error('Error creating Xendit invoice:', error);
    res.status(500).json({ error: 'Gagal membuat invoice pembayaran.' });
  }
}