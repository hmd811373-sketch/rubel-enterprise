require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const { 
    BKASH_BASE_URL, 
    BKASH_APP_KEY, 
    BKASH_APP_SECRET, 
    BKASH_USERNAME, 
    BKASH_PASSWORD,
    APP_BASE_URL 
} = process.env;

const PORT = process.env.PORT || 3000;

// ১. Grant Token API
async function getBkashToken(req, res, next) {
    try {
        const response = await axios.post(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
            app_key: BKASH_APP_KEY,
            app_secret: BKASH_APP_SECRET
        }, {
            headers: {
                'Content-Type': 'application/json',
                'username': BKASH_USERNAME,
                'password': BKASH_PASSWORD
            }
        });

        req.bkashToken = response.data.id_token;
        next();
    } catch (error) {
        console.error('Production Grant Token Error:', error.response?.data || error.message);
        res.status(401).json({ error: 'bKash Authentication Failed! Check Production Credentials.' });
    }
}

// ২. Create Payment API
app.post('/api/bkash/create-payment', getBkashToken, async (req, res) => {
    const { amount, payerReference } = req.body;
    const merchantInvoiceNumber = 'INV_' + Date.now();

    try {
        const response = await axios.post(`${BKASH_BASE_URL}/tokenized/checkout/create`, {
            mode: '0011',
            payerReference: payerReference || 'RUBEL-Enterprise',
            callbackURL: `${APP_BASE_URL}/api/bkash/callback`,
            merchantAssociationInfo: 'MI01ABC',
            amount: amount,
            currency: 'BDT',
            intent: 'sale',
            merchantInvoiceNumber: merchantInvoiceNumber
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.bkashToken,
                'X-APP-Key': BKASH_APP_KEY
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Production Create Payment Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create payment with bKash' });
    }
});

// ৩. Callback & Execute Payment API
app.get('/api/bkash/callback', getBkashToken, async (req, res) => {
    const { paymentID, status } = req.query;

    if (status !== 'success') {
        return res.redirect(`/index.html?payment=failed&reason=${status}`);
    }

    try {
        const response = await axios.post(`${BKASH_BASE_URL}/tokenized/checkout/execute`, {
            paymentID: paymentID
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.bkashToken,
                'X-APP-Key': BKASH_APP_KEY
            }
        });

        const data = response.data;

        // বিকাশ পেমেন্ট সফল যাচাই (statusCode === '0000')
        if (data && data.statusCode === '0000') {
            /* 
               এখানে আপনার ডাটাবেজে গ্রাহকের অরিজিনাল পেমেন্ট রেকর্ড
               (trxID, amount, merchantInvoiceNumber) সেভ করতে হবে।
            */
            console.log('Payment Successful! TrxID:', data.trxID);

            return res.redirect(`/index.html?payment=success&trxID=${data.trxID}&amount=${data.amount}`);
        } else {
            return res.redirect(`/index.html?payment=failed&message=${data.statusMessage}`);
        }
    } catch (error) {
        console.error('Production Execute Error:', error.response?.data || error.message);
        res.redirect('/index.html?payment=error');
    }
});

app.listen(PORT, () => {
    console.log(`RUBEL Enterprise Production Backend Running on Port ${PORT}`);
});
