// Mengimpor library yang dibutuhkan
// Import admin dari firebase.js yang sudah ada
// import { db } from '../firebase'; 

export default async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Ambil token dari header dan environment variables
  const mayarTokenHeader = req.headers['mayar-webhook-token'];
  const myWebhookToken = process.env.MAYAR_WEBHOOK_TOKEN;

  // Verifikasi token untuk memastikan request datang dari Mayar
  if (mayarTokenHeader !== myWebhookToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const event = req.body;

  // Proses event dari Mayar
  if (event.type === 'invoice.paid' && event.status === 'paid') {
    const merchantRef = event.data.merchant_ref;
    // merchantRef akan berisi `FASHIONOS-UID-TIMESTAMP-plan`
    const [appName, uid, timestamp, plan] = merchantRef.split('-');

    // Lakukan pembaruan status langganan di database Firebase Anda di sini
    console.log(`Pembayaran berhasil untuk pengguna: ${uid}, paket: ${plan}`);

    // TODO: Tambahkan kode untuk memperbarui status langganan di Firebase
    // Contoh:
    // const userRef = db.collection('users').doc(uid);
    // await userRef.update({ 
    //   subscriptionStatus: 'active',
    //   subscriptionEndDate: ... // Hitung tanggal berakhir
    // });
  }

  return res.status(200).json({ message: 'Webhook received' });
}