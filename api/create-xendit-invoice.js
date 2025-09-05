const { Xendit } = require('xendit-node');

export default async function handler(req, res) {
  // LANGKAH 1: LOGGING EKSPLISIT UNTUK DEBUGGING
  // Kita akan langsung mencatat apa yang Vercel lihat.
  console.log("Mencoba membaca XENDIT_SECRET_KEY:", process.env.XENDIT_SECRET_KEY);

  // LANGKAH 2: PENGECEKAN DINI
  // Jika key tidak ada, kita kirim error yang lebih jelas.
  if (!process.env.XENDIT_SECRET_KEY) {
    console.error("FATAL ERROR: XENDIT_SECRET_KEY tidak ditemukan di environment variables Vercel.");
    return res.status(500).json({ 
      message: "Konfigurasi sisi server error: Secret Key tidak ditemukan.",
      error_code: "SERVER_CONFIG_ERROR"
    });
  }

  const xenditClient = new Xendit({
    secretKey: process.env.XENDIT_SECRET_KEY,
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { amount, externalId, payerEmail, description, businessId } = req.body;
    
    const { Invoice } = xenditClient;

    const invoice = await Invoice.createInvoice({
      data: {
        externalID: externalId,
        amount: amount,
        payerEmail: payerEmail,
        description: description,
        successRedirectURL: `${req.headers.origin}/langganan?status=success`,
        failureRedirectURL: `${req.headers.origin}/langganan?status=failure`,
        currency: 'IDR',
      },
      forUserId: businessId
    });

    return res.status(200).json({ invoice_url: invoice.invoiceUrl });

  } catch (error) {
    console.error('Error detail dari Xendit:', error);
    return res.status(500).json({ 
      message: error.message || 'Terjadi kesalahan internal', 
      error_code: error.errorCode || 'UNKNOWN_ERROR',
      errors: error.errors
    });
  }
}