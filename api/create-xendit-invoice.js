const { Xendit } = require('xendit-node');

const xenditClient = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { amount, external_id, payer_email, description } = req.body;
    
    const { Invoice } = xenditClient;

    const invoice = await Invoice.createInvoice({
      data: {
        external_id: external_id,
        amount: amount,
        payer_email: payer_email,
        description: description,
        successRedirectURL: `${req.headers.origin}/langganan?status=success`,
        failureRedirectURL: `${req.headers.origin}/langganan?status=failure`,
        currency: 'IDR',
      }
    });

    return res.status(200).json({ invoice_url: invoice.invoiceUrl });

  } catch (error) {
    console.error('--- DETAIL ERROR DARI XENDIT ---');
    console.error(JSON.stringify(error, null, 2));
    
    return res.status(500).json({ 
      message: error.message || 'Terjadi kesalahan internal', 
      error_code: error.errorCode || 'UNKNOWN_ERROR',
      errors: error.errors
    });
  }
}