const { Xendit } = require('xendit-node');

const x = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId, email } = req.body;

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

    const invoice = await x.Invoice.createInvoice({
      data: {
        external_id: `FASHION-OS-${userId}-${Date.now()}`, // <-- PERBAIKAN FINAL DI SINI
        amount: amount,
        payerEmail: email,
        description: description,
        currency: 'IDR',
        successRedirectURL: 'https://fashion-os-app.vercel.app/payment-success',
        failureRedirectURL: 'https://fashion-os-app.vercel.app/payment-failed',
      }
    });

    res.status(200).json({ paymentUrl: invoice.invoiceUrl });

  } catch (error) {
    console.error('--- XENDIT VALIDATION ERRORS ---');
    if (error.response && error.response.errors) {
      console.error(JSON.stringify(error.response.errors, null, 2));
    } else {
      console.error(JSON.stringify(error, null, 2));
    }

    res.status(500).json({ 
      error: 'Gagal membuat invoice pembayaran.', 
      details: error.response || error.message
    });
  }
}