const { Xendit } = require('xendit-node');

const xendit = new Xendit({
    secretKey: process.env.XENDIT_SECRET_KEY,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { amount, externalId, payerEmail, description } = req.body;

        const invoice = await xendit.Invoice.createInvoice({
            data: {
                externalID: externalId,
                amount: amount,
                payerEmail: payerEmail,
                description: description,
                successRedirectURL: `${req.headers.origin}/langganan`,
                failureRedirectURL: `${req.headers.origin}/langganan`,
                invoiceDuration: 86400,
                currency: 'IDR',
            }
        });
        
        return res.status(200).json({ invoice_url: invoice.invoice_url });

    } catch (error) {
        console.error('Error creating Xendit invoice:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}