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

  console.log("--- LOG WEBHOOK: Request Diterima ---");
  console.log("Full Request URL:", request.url); // Log URL lengkap untuk melihat query params
  console.log("Request Body:", JSON.stringify(request.body, null, 2));

  const { event, data } = request.body;
  if (!data) {
    return response.status(400).json({ message: 'Struktur webhook tidak valid: object "data" tidak ditemukan.' });
  }
  const { status, customerEmail, amount, id: mayarTransactionId } = data;

  if (event !== 'payment.received' || status !== 'SUCCESS') {
    return response.status(200).json({ message: 'Webhook diterima, tetapi bukan event pembayaran sukses.' });
  }

  // --- Langkah 1: Ekstrak Kode Rujukan ---
  const { refCode } = request.query;
  const referredByCode = refCode || null;
  console.log(`LOG WEBHOOK: Mengekstrak refCode dari URL, hasilnya: ${referredByCode}`);

  try {
    const usersRef = db.collection('users');
    console.log(`LOG WEBHOOK: Mencari pengguna dengan email: ${customerEmail}`);
    const userQuery = await usersRef.where('email', '==', customerEmail).limit(1).get();

    if (userQuery.empty) {
      console.error(`❌ FATAL ERROR: Pengguna dengan email ${customerEmail} tidak ditemukan di database.`);
      return response.status(404).json({ message: 'User not found' });
    }

    const userDoc = userQuery.docs[0];
    const userId = userDoc.id;
    console.log(`LOG WEBHOOK: Pengguna ditemukan, UID: ${userId}`);

    const plan = (amount === 250000 || amount === 3000000) ? 'bulanan' : 'tahunan';
    const now = new Date();
    let subscriptionEndDate;
    if (plan === 'bulanan') {
      subscriptionEndDate = new Date(new Date().setMonth(now.getMonth() + 1));
    } else {
      subscriptionEndDate = new Date(new Date().setFullYear(now.getFullYear() + 1));
    }

    await db.runTransaction(async (transaction) => {
      console.log('LOG WEBHOOK: Memulai transaksi Firestore...');
      const userDocRef = db.collection('users').doc(userId);
      transaction.set(userDocRef, {
        subscriptionStatus: 'active',
        subscriptionEndDate: subscriptionEndDate,
        plan: plan,
        trialEndDate: admin.firestore.FieldValue.delete(),
        lastPayment: { date: now, amount: amount, invoiceId: mayarTransactionId }
      }, { merge: true });
      console.log('LOG WEBHOOK: Status langganan pengguna sudah di-set untuk diupdate.');

      // --- Langkah 2: Proses Komisi ---
      if (referredByCode) {
        console.log(`LOG WEBHOOK: Mencari mitra dengan referralCode: ${referredByCode}`);
        
        const partnerQuery = usersRef.where('referralCode', '==', referredByCode).limit(1);
        const partnerSnapshot = await transaction.get(partnerQuery);
        
        if (!partnerSnapshot.empty) {
          const partnerDoc = partnerSnapshot.docs[0];
          const partnerId = partnerDoc.id;
          console.log(`LOG WEBHOOK: Mitra ditemukan, UID: ${partnerId}`);
          
          const commissionAmount = amount * 0.10;
          const commissionDocRef = db.collection('commissions').doc();
          
          transaction.set(commissionDocRef, {
            partnerId: partnerId, partnerEmail: partnerDoc.data().email,
            referredUserId: userId, referredUserEmail: customerEmail,
            transactionAmount: amount, commissionAmount: commissionAmount,
            status: 'unpaid', createdAt: now, mayarInvoiceId: mayarTransactionId
          });
          console.log(`✅ BERHASIL: Dokumen komisi untuk mitra ${partnerId} sudah di-set untuk dibuat.`);
        } else {
          console.error(`❌ KESALAHAN LOGIKA: Kode rujukan ${referredByCode} diterima, tetapi TIDAK ADA mitra yang cocok ditemukan di database.`);
        }
      } else {
        console.log('LOG WEBHOOK: Tidak ada kode rujukan, proses komisi dilewati.');
      }
    });

    console.log('LOG WEBHOOK: Transaksi Firestore berhasil diselesaikan.');
    return response.status(200).json({ message: 'Webhook berhasil diproses.' });

  } catch (error) {
    console.error('❌ FATAL ERROR: Gagal memproses transaksi webhook:', error);
    return response.status(500).json({ message: 'Gagal memproses webhook', error: error.message });
  }
}