const crypto = require('crypto');
const { db } = require('../firebase.js');
const { doc, updateDoc } = require('firebase/firestore');

const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { merchant_ref, signature } = req.body;
  const json_data = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', TRIPAY_PRIVATE_KEY)
                     .update(json_data)
                     .digest('hex');

  // VERIFIKASI SIGNATURE
  if (signature !== hash) {
    return res.status(401).json({ message: 'Unauthorized. Invalid signature.' });
  }

  // AMBIL ID USER DARI merchant_ref
  const userId = merchant_ref.split('-')[1];

  try {
    // UPDATE STATUS LANGGANAN DI FIRESTORE
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'userData.subscriptionStatus': 'active',
      'userData.subscriptionEndDate': new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // Contoh: 30 hari
    });
    
    return res.status(200).json({ success: true, message: 'Webhook received and processed.' });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}