import { Xendit } from 'xendit-node';

// PENTING: Kunci API Xendit harus disimpan sebagai Environment Variable di Vercel
const xendit = new Xendit({
    secretKey: process.env.VITE_XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { amount, externalId, payerEmail, description, plan, userId } = req.body;

        if (!amount || !externalId || !payerEmail || !description) {
            return res.status(400).json({ message: 'Missing required parameters' });
        }

        const invoice = await xendit.Invoice.createInvoice({
            externalID: externalId,
            amount: amount,
            payerEmail: payerEmail,
            description: description,
            successRedirectURL: `${req.headers.origin}?paymentStatus=success&plan=${plan}&userId=${userId}`,
            failureRedirectURL: `${req.headers.origin}?paymentStatus=failure&plan=${plan}&userId=${userId}`,
            invoiceDuration: 86400, // 24 jam
            currency: 'IDR',
        });
        
        return res.status(200).json({ invoice_url: invoice.invoice_url });

    } catch (error) {
        console.error('Error creating Xendit invoice:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}