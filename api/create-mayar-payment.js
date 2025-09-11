import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { amount, item_name, customer_email, callback_url, redirect_url, merchant_ref } = req.body;
  const apiKey = process.env.MAYAR_API_KEY; // <-- Mengambil kunci dari Vercel Environment Variables

  try {
    const response = await axios.post('https://api.mayar.id/api/v1/invoices', {
      amount,
      item_name,
      customer_email,
      callback_url,
      redirect_url,
      merchant_ref,
      // Tambahkan data Mayar lain yang diperlukan di sini
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 && response.data.invoice_url) {
      return res.status(200).json({ invoice_url: response.data.invoice_url });
    } else {
      console.error('Mayar Error:', response.data);
      return res.status(response.status).json({ message: 'Mayar Error', error: response.data });
    }

  } catch (error) {
    console.error('Kesalahan dalam API Mayar:', error.response ? error.response.data : error.message);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}