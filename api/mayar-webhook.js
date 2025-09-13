const admin = require('firebase-admin');

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

  console.log("--- LOG: Menerima Webhook dari Mayar ---");
  console.log("Body:", JSON.stringify(request.body, null, 2));

  const { status, reference_id, customer, items } = request.body;
  const rawMerchantRef = request.body.merchant_ref;

  if (status !== 'paid') {
    return response.status(200).json({ message: 'Webhook diterima, status bukan paid.' });
  }
  
  if (!rawMerchantRef || !customer?.email || !items || items.length === 0) {
    return response.status(400).json({ message: 'Payload webhook tidak lengkap.' });
  }

  // <-- AWAL PERBAIKAN: Logika baru untuk mem-parsing merchant_ref -->
  const refParts = rawMerchantRef.split(':');
  const mainRef = refParts[0];
  const referredByCode = refParts.length > 1 ? refParts[1] : null;

  const mainRefParts = mainRef.split('-');
  const userId = mainRefParts[1];
  const plan = mainRefParts[mainRefParts.length - 1]; // Ambil plan dari bagian akhir
  // <-- AKHIR PERBAIKAN -->
  
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
    await db.runTransaction(async (transaction) => {
      const userDocRef = db.collection('users').doc(userId);
      transaction.set(userDocRef, {
        subscriptionStatus: 'active',
        subscriptionEndDate: subscriptionEndDate,
        plan: plan,
        trialEndDate: admin.firestore.FieldValue.delete(),
        lastPayment: {
            date: now,
            amount: items[0].rate,
            invoiceId: reference_id
        }
      }, { merge: true });
      console.log(`LOG: Status langganan untuk user ${userId} akan diperbarui.`);

      if (referredByCode) {
        console.log(`LOG: Kode rujukan ditemukan di merchant_ref: ${referredByCode}. Mencari mitra...`);
        
        const partnerQuery = db.collection('users').where('referralCode', '==', referredByCode).limit(1);
        const partnerSnapshot = await transaction.get(partnerQuery); // Gunakan transaction.get
        
        if (!partnerSnapshot.empty) {
          const partnerDoc = partnerSnapshot.docs[0];
          const partnerId = partnerDoc.id;
          const commissionAmount = items[0].rate * 0.10;

          const commissionDocRef = db.collection('commissions').doc();
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

    return response.status(200).json({ message: 'Webhook berhasil diproses.' });

  } catch (error) {
    console.error('FATAL ERROR: Gagal memproses transaksi webhook:', error);
    return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
  }
}