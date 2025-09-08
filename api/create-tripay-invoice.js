const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { amount, externalId, payerEmail, description } = req.body;

  try {
    const data = {
      method: 'BRIVA', // Contoh: Pembayaran via BRIVA
      merchant_ref: externalId,
      amount: amount,
      customer_name: 'Pelanggan',
      customer_email: payerEmail,
      order_items: [{
        price: amount,
        quantity: 1,
        name: description,
      }],
      return_url: `${req.headers.origin}/langganan?status=success`,
      expired_time: Math.round((Date.now() / 1000) + (24 * 60 * 60)), // <-- PERBAIKAN DI SINI, waktu dalam detik
      signature: crypto.createHmac('sha256', process.env.TRIPAY_PRIVATE_KEY)
                        .update(process.env.TRIPAY_MERCHANT_CODE + externalId + String(amount))
                        .digest('hex')
    };

    const response = await fetch('https://tripay.co.id/api-sandbox/transaction/create', { // <-- URL SIMULASI
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.TRIPAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      return res.status(200).json({ payment_url: result.data.checkout_url });
    } else {
      console.error('Error creating Tripay invoice:', result.message);
      return res.status(500).json({ message: 'Tripay Error', error: result.message });
    }

  } catch (error) {
    console.error('Error in Tripay API:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}