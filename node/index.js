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
const bodyParser = require('body-parser');
const cors = require('cors');
const { stringify } = require('csv-stringify/sync');
const XLSX = require('xlsx');
const db = require('./db/database');

const APP_PORT = process.env.APP_PORT || 8000;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_PRODUCTS = (process.env.PLAID_PRODUCTS || Products.Transactions).split(',');
const PLAID_COUNTRY_CODES = (process.env.PLAID_COUNTRY_CODES || 'US').split(',');
const PLAID_REDIRECT_URI = process.env.PLAID_REDIRECT_URI || '';
const PLAID_ANDROID_PACKAGE_NAME = process.env.PLAID_ANDROID_PACKAGE_NAME || '';
const API_KEY = process.env.API_KEY;

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error('Missing PLAID_CLIENT_ID or PLAID_SECRET');
  process.exit(1);
}

// Database-backed storage with in-memory fallback for backward compatibility
// In production, tokens are persisted in PostgreSQL and loaded on startup
// For backward compatibility, ACCESS_TOKEN and ITEM_ID are maintained in memory
// See PRODUCTION_DATABASE_SETUP.md for production database setup
let ACCESS_TOKEN = null;
let ITEM_ID = null;
let DB_ENABLED = false;

// Initialize database connection
async function initializeDatabase() {
  try {
    db.initializePool();
    const connected = await db.testConnection();
    if (connected) {
      DB_ENABLED = true;
      console.log('Database integration enabled');
      
      // Load the most recent active token into memory for backward compatibility
      const token = await db.getMostRecentActiveToken();
      if (token) {
        ACCESS_TOKEN = token.access_token;
        ITEM_ID = token.item_id;
        console.log(`Loaded token for item ${ITEM_ID} from database`);
      }
    } else {
      console.warn('Database connection failed - using in-memory storage only');
    }
  } catch (error) {
    console.warn('Database initialization failed - using in-memory storage only:', error.message);
  }
}

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
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware to verify API key for token endpoints
function verifyApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  if (!API_KEY) {
    // If no API key is configured, allow access (for development)
    console.warn('API_KEY not configured - token endpoints are unprotected');
    return next();
  }
  if (providedKey === API_KEY) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized - invalid or missing API key' });
}

// -----------------------------------------------------------------------------
// Health check endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health/db', async (_req, res) => {
  if (!DB_ENABLED) {
    return res.status(503).json({ 
      status: 'unavailable', 
      message: 'Database not configured or connection failed' 
    });
  }
  
  try {
    const connected = await db.testConnection();
    if (connected) {
      return res.json({ status: 'ok', message: 'Database connection healthy' });
    } else {
      return res.status(503).json({ status: 'error', message: 'Database connection failed' });
    }
  } catch (error) {
    return res.status(503).json({ 
      status: 'error', 
      message: 'Database health check failed',
      error: error.message 
    });
  }
});

// -----------------------------------------------------------------------------
// Token management endpoints

// Get all active tokens with metadata (for GCP job monitoring)
app.get('/api/tokens', verifyApiKey, async (_req, res) => {
  if (!DB_ENABLED) {
    return res.status(503).json({ 
      error: 'Database not configured - tokens cannot be retrieved' 
    });
  }
  
  try {
    const tokens = await db.getAllActiveTokens();
    // Mask access tokens for security - show only last 4 characters
    const maskedTokens = tokens.map(token => ({
      id: token.id,
      user_id: token.user_id,
      access_token_preview: '...' + token.access_token.slice(-4),
      item_id: token.item_id,
      institution_name: token.institution_name,
      accounts: token.accounts,
      created_at: token.created_at,
      last_used_at: token.last_used_at,
    }));
    res.json({ tokens: maskedTokens, count: maskedTokens.length });
  } catch (error) {
    console.error('Error retrieving tokens:', error.message);
    res.status(500).json({ error: 'Failed to retrieve tokens', message: error.message });
  }
});

// Get the currently active access token for data extraction (used by GCP job)
app.get('/api/tokens/active', verifyApiKey, async (_req, res) => {
  if (!DB_ENABLED) {
    // Fallback to in-memory token
    if (ACCESS_TOKEN && ITEM_ID) {
      return res.json({ 
        access_token: ACCESS_TOKEN, 
        item_id: ITEM_ID,
        source: 'memory' 
      });
    }
    return res.status(404).json({ error: 'No active token available' });
  }
  
  try {
    const token = await db.getMostRecentActiveToken();
    if (token) {
      // Update last_used_at timestamp
      await db.updateLastUsed(token.access_token);
      return res.json({ 
        access_token: token.access_token, 
        item_id: token.item_id,
        institution_name: token.institution_name,
        accounts: token.accounts,
        last_used_at: new Date().toISOString(),
        source: 'database'
      });
    } else {
      return res.status(404).json({ error: 'No active token found in database' });
    }
  } catch (error) {
    console.error('Error retrieving active token:', error.message);
    res.status(500).json({ error: 'Failed to retrieve active token', message: error.message });
  }
});

// -----------------------------------------------------------------------------
// Link token creation
app.post('/api/create_link_token', async (req, res) => {
  try {
    const configs = {
      // TODO: Replace 'demo-user-id' with actual user ID from authentication system in production
      user: { client_user_id: 'demo-user-id' }, // FIXME: Hardcoded user ID
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

// Public token exchange - now with database persistence
app.post('/api/set_access_token', async (req, res) => {
  const { public_token } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });
  try {
    const tokenResponse = await client.itemPublicTokenExchange({ public_token });
    const accessToken = tokenResponse.data.access_token;
    const itemId = tokenResponse.data.item_id;
    
    // Set in-memory variables for backward compatibility
    ACCESS_TOKEN = accessToken;
    ITEM_ID = itemId;
    
    // Save to database if enabled
    if (DB_ENABLED) {
      try {
        // Fetch institution and account details
        const [itemData, accountsData] = await Promise.all([
          client.itemGet({ access_token: accessToken }),
          client.accountsGet({ access_token: accessToken })
        ]);
        
        const institutionName = itemData.data.item?.institution_id || 'Unknown';
        const accounts = accountsData.data.accounts;
        
        // Save token with metadata to database
        // TODO: Replace 'demo-user-id' with actual user ID from authentication system in production
        await db.saveToken(
          'demo-user-id', // FIXME: Hardcoded user ID - implement proper authentication
          accessToken,
          itemId,
          institutionName,
          accounts
        );
        
        console.log(`Token saved to database for item ${itemId}`);
      } catch (dbError) {
        console.error('Failed to save token to database:', dbError.message);
        // Don't fail the request if database save fails - token is still in memory
      }
    }
    
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
    
    // Update last_used_at if database is enabled
    if (DB_ENABLED && ACCESS_TOKEN) {
      db.updateLastUsed(ACCESS_TOKEN).catch(err => 
        console.error('Failed to update last_used_at:', err.message)
      );
    }
    
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
    
    // Update last_used_at if database is enabled
    if (DB_ENABLED && ACCESS_TOKEN) {
      db.updateLastUsed(ACCESS_TOKEN).catch(err => 
        console.error('Failed to update last_used_at:', err.message)
      );
    }
    
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
    
    // Update last_used_at if database is enabled
    if (DB_ENABLED && ACCESS_TOKEN) {
      db.updateLastUsed(ACCESS_TOKEN).catch(err => 
        console.error('Failed to update last_used_at:', err.message)
      );
    }
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

// Start the server with database initialization and graceful shutdown
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    
    // Start Express server
    const server = app.listen(APP_PORT, () => {
      console.log(`Hawaii Farming backend running on port ${APP_PORT}`);
      console.log(`Environment: ${PLAID_ENV}`);
      console.log(`Database: ${DB_ENABLED ? 'enabled' : 'disabled (in-memory only)'}`);
      if (!API_KEY) {
        console.warn('WARNING: API_KEY not set - token endpoints are unprotected!');
      }
    });
    
    // Graceful shutdown handler
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      // Close Express server
      server.close(() => {
        console.log('Express server closed');
      });
      
      // Close database connection pool
      if (DB_ENABLED) {
        try {
          await db.closePool();
        } catch (error) {
          console.error('Error closing database pool:', error.message);
        }
      }
      
      process.exit(0);
    };
    
    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();