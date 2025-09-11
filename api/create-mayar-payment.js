// File: /api/create-mayar-payment.js

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Ambil data dari frontend
    const { amount, plan, email } = req.body;
    const mayarSecretKey = process.env.MAYAR_SECRET_KEY;

    // Siapkan data yang akan dikirim ke Mayar
    const mayarRequestBody = {
      customer_name: "Pelanggan Fashion OS", // Anda bisa membuat ini dinamis nanti
      customer_email: email,
      items: [
        {
          name: `Langganan Fashion OS - ${plan}`,
          quantity: 1,
          price: amount,
        },
      ],
      // URL kemana pelanggan akan diarahkan setelah pembayaran berhasil
      callback_url: "https://appfashion.id/dashboard?payment=success",
    };

    // Panggil API Mayar untuk membuat link pembayaran
    const response = await fetch("https://api.mayar.id/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Gunakan Secret Key dari Vercel Environment Variables
        "Authorization": `Bearer ${mayarSecretKey}`,
      },
      body: JSON.stringify(mayarRequestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      // Jika ada error dari Mayar, kirimkan sebagai respons
      console.error("Mayar API Error:", data);
      throw new Error(data.message || "Gagal membuat link pembayaran Mayar.");
    }
    
    // Kirim kembali link pembayaran ke frontend
    res.status(200).json({ payment_url: data.data[0].link });

  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ message: error.message });
  }
}