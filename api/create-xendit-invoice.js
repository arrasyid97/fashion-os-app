const { Xendit } = require('xendit-node');

const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Mengambil data dari frontend (nama variabel di sini tidak masalah)
    const { amount, externalId, payerEmail, description } = req.body;
    
    const { Invoice } = xenditClient;

    // Membuat invoice dengan STRUKTUR DAN NAMA PARAMETER YANG BENAR
    const invoice = await Invoice.createInvoice({
      data: { // <-- "PEMBUNGKUS" data yang diperlukan
        externalID: externalId, // <-- Menggunakan externalID (dengan ID besar)
        amount: amount,
        payerEmail: payerEmail, // <-- Menggunakan payerEmail (E besar)
        description: description,
        successRedirectURL: `${req.headers.origin}/langganan?status=success`,
        failureRedirectURL: `${req.headers.origin}/langganan?status=failure`,
        currency: 'IDR',
      }
    });

    return res.status(200).json({ invoice_url: invoice.invoiceUrl });

  } catch (error) {
    // Mencatat error detail dari Xendit di log Vercel
    console.error('--- DETAIL ERROR DARI XENDIT ---');
    console.error(JSON.stringify(error, null, 2));
    
    return res.status(500).json({ 
      message: error.message || 'Terjadi kesalahan internal', 
      error_code: error.errorCode || 'UNKNOWN_ERROR',
      errors: error.errors
    });
  }
}