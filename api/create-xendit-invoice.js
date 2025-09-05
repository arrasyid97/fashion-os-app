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
    const { amount, externalId, payerEmail, description, businessId } = req.body;

    // Membuat invoice dengan memanggil instance dari Invoice API
    const { Invoice } = xenditClient;
    const invoiceSpecificOptions = {}; // Biarkan kosong jika tidak yakin

    const invoice = await Invoice.createInvoice({
      data: { // <-- INI ADALAH PERBAIKAN UTAMA
        externalID: externalId,
        amount: amount,
        payerEmail: payerEmail,
        description: description,
        successRedirectURL: `${req.headers.origin}/langganan?status=success`,
        failureRedirectURL: `${req.headers.origin}/langganan?status=failure`,
        currency: 'IDR',
      },
      // Header 'for-user-id' untuk akun platform
      forUserId: businessId, 
    }, invoiceSpecificOptions);

    return res.status(200).json({ invoice_url: invoice.invoiceUrl });

  } catch (error) {
    // Kirim kembali error yang lebih detail dari Xendit untuk debugging
    console.error('Error creating Xendit invoice:', error);
    return res.status(500).json({ 
      message: error.message, 
      error_code: error.errorCode,
      errors: error.errors
    });
  }
}