// File: /api/create-mayar-payment.js (VERSI DEBUGGING BARU)

export default async function handler(req, res) {
  console.log("--- FUNGSI PEMBAYARAN DIMULAI ---");

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // 1. Ambil Kunci API dan log untuk verifikasi
    const mayarSecretKey = process.env.MAYAR_SECRET_KEY;
    if (!mayarSecretKey) {
        console.error("FATAL: MAYAR_SECRET_KEY tidak ada di Vercel Environment Variables.");
        return res.status(500).json({ message: "Konfigurasi server tidak lengkap: Kunci API Mayar tidak ditemukan." });
    }
    // Log sebagian kecil kunci untuk memastikan ia terbaca
    console.log(`Kunci Mayar ditemukan. Berakhir dengan: ...${mayarSecretKey.slice(-4)}`);

    // 2. Ambil data dari frontend
    const { amount, plan, email } = req.body;
    console.log("Data diterima dari frontend:", { amount, plan, email });

    // 3. Siapkan body permintaan untuk Mayar
    const mayarRequestBody = {
      customer: {
        name: "Pelanggan Fashion OS",
        email: email,
      },
      items: [{
        name: `Langganan Fashion OS - ${plan}`,
        quantity: 1,
        price: amount,
      }],
      callback_url: "https://appfashion.id/dashboard?payment=success",
    };
    console.log("Body permintaan yang akan dikirim ke Mayar:", JSON.stringify(mayarRequestBody, null, 2));
    
    // 4. Kirim permintaan ke Mayar
    const response = await fetch("https://api.mayar.id/v1/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mayarSecretKey}`,
      },
      body: JSON.stringify(mayarRequestBody),
    });
    console.log(`Mayar merespons dengan status: ${response.status}`);

    // 5. Baca respons sebagai TEKS MENTAH (ini adalah langkah anti-gagal)
    const responseText = await response.text();
    console.log("--- RESPONS MENTAH DARI MAYAR ---");
    console.log(responseText);
    console.log("--- AKHIR RESPONS MENTAH ---");

    // 6. Coba parse sebagai JSON setelah kita tahu responsnya
    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        console.error("Gagal mem-parsing respons dari Mayar sebagai JSON.");
        // Kirim respons mentah ke frontend agar pengguna tahu apa yang terjadi
        throw new Error(`Mayar memberikan respons yang tidak valid. Respons mentah: ${responseText}`);
    }

    // 7. Periksa apakah respons dari Mayar adalah sukses
    if (!response.ok) {
      throw new Error(data.message || "Mayar menolak permintaan. Cek log untuk respons mentah.");
    }
    
    // 8. Kirim URL pembayaran kembali ke frontend
    if (data && data.redirect_url) {
      console.log("Berhasil! Mengirim URL pembayaran:", data.redirect_url);
      res.status(200).json({ payment_url: data.redirect_url });
    } else {
      throw new Error("Respons dari Mayar berhasil, tetapi tidak berisi URL pembayaran.");
    }

  } catch (error) {
    console.error("--- TERJADI ERROR DI DALAM FUNGSI ---");
    console.error(error.message);
    res.status(500).json({ message: error.message });
  }
}

