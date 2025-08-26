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

  const { userId, plan, paymentStatus } = request.body;

  if (!userId || !plan || !paymentStatus) {
    return response.status(400).json({ message: 'Missing required fields' });
  }

  const now = new Date();
  let subscriptionEndDate;
  if (plan === 'bulanan') {
    subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
  } else if (plan === 'tahunan') {
    subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 1));
  } else {
    return response.status(400).json({ message: 'Invalid plan' });
  }

  try {
    const userDocRef = db.collection('users').doc(userId);

    await userDocRef.update({
      subscriptionStatus: paymentStatus,
      subscriptionEndDate: subscriptionEndDate,
      plan: plan,
      trialEndDate: admin.firestore.FieldValue.delete(),
    });

    return response.status(200).json({ message: 'Subscription status updated successfully' });
  } catch (error) {
    console.error('Error updating user subscription:', error);
    return response.status(500).json({ message: 'Failed to update subscription', error: error.message });
  }
}