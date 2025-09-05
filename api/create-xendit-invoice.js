const { Xendit } = require('xendit-node');

export default async function handler(req, res) {
  // PERINGATAN: Ganti '...' dengan Secret Key Anda.
  // Ini SANGAT TIDAK AMAN untuk produksi jangka panjang.
  const xenditClient = new Xendit({
    secretKey: 'xnd_development_SmEvUZxXD0xHLfziqDaSbHGyu4E5v1l3afoB1grG569Bnkb7q3smLQkLPjF0Tns',
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { amount, externalId, payerEmail, description } = req.body;
    
    const { Invoice } = xenditClient;

    // Membuat invoice dengan struktur data yang benar tanpa parameter tambahan
    const invoice = await Invoice.createInvoice({
      data: {
        externalID: externalId,
        amount: amount,
        payerEmail: payerEmail,
        description: description,
        successRedirectURL: `${req.headers.origin}/langganan?status=success`,
        failureRedirectURL: `${req.headers.origin}/langganan?status=failure`,
        currency: 'IDR',
      }
    });

    return res.status(200).json({ invoice_url: invoice.invoiceUrl });

  } catch (error) {
    // Mencatat error detail dari Xendit di log Vercel
    console.error('Error detail dari Xendit:', error);
    return res.status(500).json({ 
      message: error.message || 'Terjadi kesalahan internal', 
      error_code: error.errorCode || 'UNKNOWN_ERROR',
      errors: error.errors
    });
  }
}