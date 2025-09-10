const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const handler = require('./api/create-tripay-invoice');
const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: 'https://appfashion.id', // Domain frontend Anda di Vercel
  optionsSuccessStatus: 200 // Untuk kompatibilitas browser
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.post('/api/create-tripay-invoice', handler.default);

app.listen(port, () => {
    console.log(`Server API berjalan di http://localhost:${port}`);
});
