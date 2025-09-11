// File: /api/create-mayar-payment.js (VERSI DEBUGGING BARU)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { amount, plan, email } = req.body;
    const mayarSecretKey = process.env.MAYAR_SECRET_KEY;

    if (!mayarSecretKey) {
        throw new Error("MAYAR_SECRET_KEY tidak ditemukan di environment variables Vercel.");
    }

    const mayarRequestBody = {
      customer_name: "Pelanggan Fashion OS",
      customer_email: email,
      items: [{ name: `Langganan Fashion OS - ${plan}`, quantity: 1, price: amount }],
      callback_url: "https://appfashion.id/dashboard?payment=success",
    };

    const response = await fetch("https://api.mayar.id/v1/payment-links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mayarSecretKey}`,
      },
      body: JSON.stringify(mayarRequestBody),
    });

    // --- PERUBAHAN UTAMA DIMULAI DI SINI ---

    // Jika respons TIDAK OK, kita akan membaca balasan sebagai TEKS biasa
    if (!response.ok) {
      const errorText = await response.text();
      console.error("RESPONS MENTAH DARI MAYAR:", errorText);
      // Kirim pesan mentah ini ke frontend
      return res.status(500).json({ message: `Error dari Mayar: ${errorText}` });
    }

    // Jika respons OK, baru kita baca sebagai JSON
    const data = await response.json();
    
    // --- AKHIR PERUBAHAN ---
    
    res.status(200).json({ payment_url: data.data.redirect_url });

  } catch (error) {
    console.error("Internal Server Error:", error.message);
    res.status(500).json({ message: error.message });
  }
}