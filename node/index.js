'use strict';

// read env vars from .env file
require('dotenv').config();
const {
  Configuration,
  PlaidApi,
  Products,
  PlaidEnvironments,
} = require('plaid');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');

const APP_PORT = process.env.APP_PORT || 8000;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS || Products.Transactions).split(',');
const PLAID_COUNTRY_CODES = (process.env.PLAID_COUNTRY_CODES || 'US').split(',');
const PLAID_REDIRECT_URI = process.env.PLAID_REDIRECT_URI || '';
const PLAID_ANDROID_PACKAGE_NAME = process.env.PLAID_ANDROID_PACKAGE_NAME || '';

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('Missing PLAID_CLIENT_ID or PLAID_SECRET');
  process.exit(1);
}

// In-memory demo storage. In production: store per-user securely.
// WARNING: This is for demo purposes only! For production use with real data:
// 1. Store access tokens in an encrypted database (per user)
// 2. Implement proper authentication and authorization
// 3. Use a secrets management service for API keys
// 4. Never store tokens in memory or log them
// 5. Implement token rotation
// See PRODUCTION_SETUP.md for complete production security guidance
let ACCESS_TOKEN = null;
let ITEM_ID = null;

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});
const client = new PlaidApi(configuration);

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'https://plaid-service-982209115678.us-west1.run.app', // Restrict to known URL in production
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Serve static files from React build
const frontendBuildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendBuildPath));

// -----------------------------------------------------------------------------
// Link token creation
app.post('/api/create_link_token', async (req, res) => {
  try {
    const configs = {
      user: { client_user_id: 'demo-user-id' }, // replace with your real user id in prod
      client_name: 'Hawaii Farming',
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: 'en',
    };
    if (PLAID_REDIRECT_URI) configs.redirect_uri = PLAID_REDIRECT_URI;
    if (PLAID_ANDROID_PACKAGE_NAME) configs.android_package_name = PLAID_ANDROID_PACKAGE_NAME;

    const createTokenResponse = await client.linkTokenCreate(configs);
    res.json(createTokenResponse.data);
  } catch (err) {
    console.error('linkTokenCreate error', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Public token exchange
app.post('/api/set_access_token', async (req, res) => {
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });
  try {
    const tokenResponse = await client.itemPublicTokenExchange({ public_token });
    ACCESS_TOKEN = tokenResponse.data.access_token;
    ITEM_ID = tokenResponse.data.item_id;
    res.json({ access_token_set: true, item_id: ITEM_ID });
  } catch (err) {
    console.error('publicTokenExchange error', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// -----------------------------------------------------------------------------
// Accounts (with balances)
app.get('/api/accounts', async (_req, res) => {
  if (!ACCESS_TOKEN) return res.status(400).json({ error: 'No access token set' });
  try {
    const r = await client.accountsGet({ access_token: ACCESS_TOKEN });
    res.json(r.data.accounts);
  } catch (err) {
    console.error('accountsGet error', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Helper: fetch all transactions with pagination
async function fetchAllTransactions({ start_date, end_date, account_ids }) {
  const pageSize = 500;
  let offset = 0;
  let all = [];
  let total = null;

  // first page
  const first = await client.transactionsGet({
    access_token: ACCESS_TOKEN,
    start_date,
    end_date,
    options: {
      count: pageSize,
      offset,
      ...(account_ids?.length ? { account_ids } : {}),
    },
  });
  total = first.data.total_transactions;
  all = all.concat(first.data.transactions);
  offset += pageSize;

  // subsequent pages
  while (all.length < total) {
    const r = await client.transactionsGet({
      access_token: ACCESS_TOKEN,
      start_date,
      end_date,
      options: {
        count: pageSize,
        offset,
        ...(account_ids?.length ? { account_ids } : {}),
      },
    });
    all = all.concat(r.data.transactions);
    offset += pageSize;
  }

  return { accounts: first.data.accounts, transactions: all };
}

// Transactions (JSON)
app.post('/api/transactions', async (req, res) => {
  const { start_date, end_date, account_ids } = req.body;
  if (!ACCESS_TOKEN) return res.status(400).json({ error: 'No access token set' });
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
  }
  try {
    const data = await fetchAllTransactions({ start_date, end_date, account_ids });
    res.json(data);
  } catch (err) {
    console.error('transactionsGet error', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Export transactions to CSV or XLSX
app.post('/api/transactions/export', async (req, res) => {
  const { start_date, end_date, account_ids, format = 'csv' } = req.body;
  if (!ACCESS_TOKEN) return res.status(400).json({ error: 'No access token set' });
  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
  }

  try {
    const { transactions } = await fetchAllTransactions({ start_date, end_date, account_ids });
    const rows = transactions.map(t => ({
      account_id: t.account_id,
      date: t.date,
      name: t.name,
      amount: t.amount,
      category: t.category?.join(' / ') || '',
      merchant: t.merchant_name || '',
      pending: t.pending,
      iso_currency: t.iso_currency_code,
    }));

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    } else {
      const csv = stringify(rows, { header: true });
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    }
  } catch (err) {
    console.error('transactions/export error', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Scheduled export endpoint (protected by API key)
app.post('/api/scheduled-export', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;
  
  // Use constant-time comparison to prevent timing attacks
  if (!apiKey || !expectedKey || 
      apiKey.length !== expectedKey.length ||
      !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Service not initialized. Access token must be set before using scheduled exports. Please connect a bank account through the UI first.' });
  }
  
  try {
    const { format = 'xlsx', days = 30 } = req.body;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const data = await fetchAllTransactions({
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    });
    
    res.json({ 
      success: true, 
      transactions: data.transactions.length,
      exported_at: new Date().toISOString(),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    });
  } catch (err) {
    console.error('Scheduled export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.PLAID_ENV || 'sandbox'
  });
});

// Catch-all: serve React index.html for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

const PORT = process.env.PORT || APP_PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving frontend from: ${frontendBuildPath}`);
});