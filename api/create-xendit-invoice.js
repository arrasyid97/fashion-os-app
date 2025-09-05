const { Xendit } = require('xendit-node');

// Inisialisasi Xendit dengan Secret Key dari Vercel Environment Variables
const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Hanya mengambil data yang relevan dari frontend
    const { amount, externalId, payerEmail, description } = req.body;
    
    const { Invoice } = xenditClient;

    // Membuat invoice dengan struktur data yang benar
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