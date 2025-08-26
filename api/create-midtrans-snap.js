const Midtrans = require('midtrans-client');

export default async function handler(request, response) {
  // Pastikan metode permintaan adalah POST
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // Tangkap data yang dikirim dari frontend (Vue.js)
  const { transaction_details, customer_details, item_details } = request.body;
console.log('Received payload:', request.body);
  // Pastikan environment variable sudah diatur di Vercel
  if (!process.env.MIDTRANS_SERVER_KEY) {
    return response.status(500).json({ message: 'Server key not configured' });
  }

  try {
    // Inisialisasi Midtrans Snap
    let snap = new Midtrans.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });

    // Buat parameter transaksi
    let parameter = {
      transaction_details: transaction_details,
      customer_details: customer_details,
      item_details: item_details,
    };

    // Buat token pembayaran (Snap)
    const transaction = await snap.createTransaction(parameter);
    const snapToken = transaction.token;
console.log('Midtrans API response:', transaction);
    // Kirim token kembali ke frontend
    response.status(200).json({ snapToken: snapToken });
  } catch (e) {
    console.error('Error creating Midtrans transaction:', e);
    response.status(500).json({ message: 'Failed to create transaction', error: e.message });
  }
}