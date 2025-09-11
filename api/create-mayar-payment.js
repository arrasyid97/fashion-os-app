// File: /api/create-mayar-payment.js (VERSI FINAL YANG BENAR)

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
      items: [{
        name: `Langganan Fashion OS - ${plan}`,
        quantity: 1,
        price: amount,
      }],
      callback_url: "https://appfashion.id/dashboard?payment=success",
    };

    // --- PERBAIKAN ALAMAT URL API ---
    // Alamat yang benar adalah /v1/payment-links
    const response = await fetch("https://api.mayar.id/v1/payment-links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mayarSecretKey}`,
      },
      body: JSON.stringify(mayarRequestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mayar API Error:", data);
      throw new Error(data.message || "Gagal membuat link pembayaran Mayar.");
    }
    
    // --- PERBAIKAN PARSING RESPON ---
    // URL pembayaran ada di 'data.data[0].link' untuk endpoint ini
    if (data && data.data && data.data[0] && data.data[0].link) {
      res.status(200).json({ payment_url: data.data[0].link });
    } else {
      throw new Error("Respons dari Mayar berhasil, tetapi tidak berisi URL pembayaran.");
    }

  } catch (error) {
    console.error("Internal Server Error:", error.message);
    res.status(500).json({ message: error.message });
  }
}

