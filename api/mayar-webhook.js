const admin = require('firebase-admin');

// Inisialisasi Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // <-- PERBAIKAN: Log seluruh body dari Mayar untuk debugging -->
  console.log("--- LOG: Menerima Webhook dari Mayar ---");
  console.log("Body:", JSON.stringify(request.body, null, 2));

  // <-- PERBAIKAN: Ambil semua data yang relevan dari payload webhook -->
  const { status, reference_id, metadata, customer, items } = request.body;
  const merchantRef = request.body.merchant_ref; // Nama field di webhook adalah merchant_ref

  if (status !== 'paid') {
    console.log(`LOG: Status pembayaran adalah '${status}', bukan 'paid'. Proses dihentikan.`);
    return response.status(200).json({ message: 'Webhook diterima, status bukan paid.' });
  }
  
  if (!merchantRef || !customer?.email || !items || items.length === 0) {
    return response.status(400).json({ message: 'Payload webhook tidak lengkap.' });
  }

  // <-- PERBAIKAN: Ekstrak userId dan plan dari merchant_ref -->
  const refParts = merchantRef.split('-');
  const userId = refParts[1];
  const plan = refParts[5]; // Mengambil 'bulanan' atau 'tahunan' dari akhir ref
  const referredByCode = metadata?.referredByCode;
  
  const now = new Date();
  let subscriptionEndDate;
  if (plan === 'bulanan') {
    subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
  } else if (plan === 'tahunan') {
    subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
  } else {
    return response.status(400).json({ message: 'Plan tidak valid di merchant_ref' });
  }

  try {
    // <-- PERBAIKAN: Gunakan Transaksi Firestore -->
    await db.runTransaction(async (transaction) => {
      // Langkah 1: Update status langganan pengguna
      const userDocRef = db.collection('users').doc(userId);
      transaction.set(userDocRef, {
        subscriptionStatus: 'active',
        subscriptionEndDate: subscriptionEndDate,
        plan: plan,
        trialEndDate: admin.firestore.FieldValue.delete(), // Hapus masa trial jika ada
        lastPayment: { // Catat detail pembayaran terakhir
            date: now,
            amount: items[0].rate,
            invoiceId: reference_id
        }
      }, { merge: true });
      console.log(`LOG: Status langganan untuk user ${userId} akan diperbarui.`);

      // Langkah 2: Jika ada kode rujukan, catat komisi
      if (referredByCode) {
        console.log(`LOG: Kode rujukan ditemukan: ${referredByCode}. Mencari mitra...`);
        
        // Cari mitra yang memiliki referralCode ini
        const partnerQuery = db.collection('users').where('referralCode', '==', referredByCode).limit(1);
        const partnerSnapshot = await partnerQuery.get();
        
        if (!partnerSnapshot.empty) {
          const partnerDoc = partnerSnapshot.docs[0];
          const partnerId = partnerDoc.id;
          const commissionAmount = items[0].rate * 0.10; // Komisi 10%

          const commissionDocRef = db.collection('commissions').doc(); // Buat ID dokumen baru
          transaction.set(commissionDocRef, {
            partnerId: partnerId,
            partnerEmail: partnerDoc.data().email,
            referredUserId: userId,
            referredUserEmail: customer.email,
            transactionAmount: items[0].rate,
            commissionAmount: commissionAmount,
            status: 'unpaid',
            createdAt: now,
            mayarInvoiceId: reference_id
          });
          console.log(`✅ BERHASIL: Komisi sebesar ${commissionAmount} untuk mitra ${partnerId} akan dicatat.`);
        } else {
          console.error(`❌ PERINGATAN: Kode rujukan ${referredByCode} diterima, tetapi tidak ada mitra yang cocok ditemukan.`);
        }
      }
    });

    console.log(`LOG: Transaksi Firestore untuk ${userId} berhasil diselesaikan.`);
    return response.status(200).json({ message: 'Webhook berhasil diproses.' });

  } catch (error) {
    console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
    return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
  }
}