import { db } from './firebase.js';
    import { doc, setDoc } from 'firebase/firestore';

    export default async function handler(req, res) {
      if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
      }

      const { event, data, merchant_ref } = req.body;

      if (event === 'invoice_paid') {
        const parts = merchant_ref.split('-');
        const userId = parts[1];
        const planType = parts[3];

        const now = new Date();
        let subscriptionEndDate;

        if (planType === 'tahunan') {
            subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 1));
        } else {
            subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
        }

        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            subscriptionStatus: 'active',
            subscriptionEndDate: subscriptionEndDate,
            trialEndDate: null
        }, { merge: true });

        console.log(`Langganan untuk user ${userId} diaktifkan.`);
        return res.status(200).json({ status: 'success' });
      }

      return res.status(200).json({ status: 'ignored' });
    }