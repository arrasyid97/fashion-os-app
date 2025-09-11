// File: /api/create-mayar-payment.js (VERSI DEBUGGING)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { amount, plan, email } = req.body;
    const mayarSecretKey = process.env.MAYAR_SECRET_KEY;

    const mayarRequestBody = {
      customer_name: "Pelanggan Fashion OS",
      customer_email: email,
      items: [{ name: `Langganan Fashion OS - ${plan}`, quantity: 1, price: amount }],
      callback_url: "https://appfashion.id/dashboard?payment=success",
    };

    const response = await fetch("https://api.mayar.id/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mayarSecretKey}`,
      },
      body: JSON.stringify(mayarRequestBody),
    });

    // --- PERUBAHAN UTAMA DIMULAI DI SINI ---

    // Jika respons TIDAK OK (bukan 200), kita akan membaca balasan sebagai TEKS biasa
    if (!response.ok) {
      // Baca respons mentah sebagai teks
      const errorText = await response.text();
      // Tampilkan respons mentah ini di log Vercel!
      console.error("RESPONS MENTAH DARI MAYAR:", errorText);
      // Kirim pesan error yang lebih informatif ke frontend
      throw new Error(`Mayar merespons dengan status ${response.status}. Lihat log Vercel untuk detail.`);
    }

    // Jika respons OK, baru kita coba baca sebagai JSON
    const data = await response.json();
    
    // --- AKHIR PERUBAHAN ---

    res.status(200).json({ payment_url: data.data[0].link });

  } catch (error) {
    console.error("Internal Server Error:", error.message);
    res.status(500).json({ message: error.message });
  }
}