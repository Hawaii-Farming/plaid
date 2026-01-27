#!/usr/bin/env node
/**
 * Plaid Transactions Export Utility
 * 
 * This script exports Plaid transactions to CSV or XLSX format.
 * It uses Plaid Transactions Sync API for incremental updates with cursor persistence.
 * 
 * USAGE:
 *   node scripts/export-transactions.js
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 *   PLAID_CLIENT_ID       - Your Plaid client ID
 *   PLAID_SECRET          - Your Plaid secret key
 *   PLAID_ACCESS_TOKEN    - Access token for the linked account
 *   PLAID_ENV             - Environment: sandbox, development, or production
 * 
 * OPTIONAL ENVIRONMENT VARIABLES:
 *   EXPORT_FORMAT         - Output format: xlsx (default) or csv
 *   EXPORT_DIR            - Output directory (default: ./exports)
 *   EXPORT_ACCOUNT_IDS    - Comma-separated account IDs to filter (exports all if not set)
 *   EXPORT_START_DAYS     - Days to look back on first run (default: 30)
 * 
 * SCHEDULING:
 *   To run this script on a schedule:
 *   
 *   1. Cron (Linux/Mac):
 *      Add to crontab (crontab -e):
 *      0 2 * * * cd /path/to/plaid && node scripts/export-transactions.js >> logs/export.log 2>&1
 *      (Runs daily at 2 AM)
 *   
 *   2. Task Scheduler (Windows):
 *      Create a new task that runs: node.exe
 *      With arguments: C:\path\to\plaid\scripts\export-transactions.js
 *      Set working directory to: C:\path\to\plaid
 *   
 *   3. GitHub Actions:
 *      Add a workflow file (.github/workflows/export-transactions.yml):
 *      
 *      name: Export Transactions
 *      on:
 *        schedule:
 *          - cron: '0 2 * * *'  # Daily at 2 AM UTC
 *        workflow_dispatch:     # Allow manual trigger
 *      
 *      jobs:
 *        export:
 *          runs-on: ubuntu-latest
 *          steps:
 *            - uses: actions/checkout@v3
 *            - uses: actions/setup-node@v3
 *              with:
 *                node-version: '18'
 *            - run: npm install
 *              working-directory: ./node
 *            - run: node scripts/export-transactions.js
 *              env:
 *                PLAID_CLIENT_ID: ${{ secrets.PLAID_CLIENT_ID }}
 *                PLAID_SECRET: ${{ secrets.PLAID_SECRET }}
 *                PLAID_ACCESS_TOKEN: ${{ secrets.PLAID_ACCESS_TOKEN }}
 *                PLAID_ENV: production
 *            - uses: actions/upload-artifact@v3
 *              with:
 *                name: transactions-export
 *                path: exports/
 * 
 * SWITCHING TO PRODUCTION:
 *   1. Update PLAID_ENV=production in your .env file
 *   2. Update PLAID_CLIENT_ID and PLAID_SECRET with production credentials
 *   3. Update PLAID_ACCESS_TOKEN with a production access token
 *   4. Test the script manually before scheduling
 *   
 *   NOTE: Cursors are environment-specific. When switching environments, you may want to
 *   rename or relocate cursor.json to avoid conflicts (e.g., cursor-sandbox.json, cursor-prod.json)
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} = require('plaid');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');

// Configuration from environment
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ACCESS_TOKEN = process.env.PLAID_ACCESS_TOKEN;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const EXPORT_FORMAT = (process.env.EXPORT_FORMAT || 'xlsx').toLowerCase();
const EXPORT_DIR = process.env.EXPORT_DIR || './exports';
const EXPORT_ACCOUNT_IDS = process.env.EXPORT_ACCOUNT_IDS 
  ? process.env.EXPORT_ACCOUNT_IDS.split(',').map(id => id.trim())
  : null;
const EXPORT_START_DAYS = parseInt(process.env.EXPORT_START_DAYS || '30', 10);

// File paths
const CURSOR_FILE = path.join(__dirname, 'cursor.json');
const ROOT_DIR = path.join(__dirname, '..');

// Validate required environment variables
if (!PLAID_CLIENT_ID || !PLAID_SECRET || !PLAID_ACCESS_TOKEN) {
  console.error('ERROR: Missing required environment variables');
  console.error('Required: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ACCESS_TOKEN');
  console.error('Please check your .env file or environment configuration');
  process.exit(1);
}

// Validate export format
if (!['xlsx', 'csv'].includes(EXPORT_FORMAT)) {
  console.error(`ERROR: Invalid EXPORT_FORMAT: ${EXPORT_FORMAT}`);
  console.error('Valid options: xlsx, csv');
  process.exit(1);
}

// Initialize Plaid client
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

/**
 * Load cursor from file
 */
function loadCursor() {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      const data = fs.readFileSync(CURSOR_FILE, 'utf8');
      const json = JSON.parse(data);
      return json.cursor || null;
    }
  } catch (err) {
    console.warn('Warning: Could not load cursor from file:', err.message);
  }
  return null;
}

/**
 * Save cursor to file
 */
function saveCursor(cursor) {
  try {
    const data = JSON.stringify({ cursor, updated_at: new Date().toISOString() }, null, 2);
    fs.writeFileSync(CURSOR_FILE, data, 'utf8');
    console.log('Cursor saved successfully');
  } catch (err) {
    console.error('ERROR: Could not save cursor:', err.message);
  }
}

/**
 * Fetch transactions using Transactions Sync API
 */
async function fetchTransactionsSync(cursor) {
  const added = [];
  const modified = [];
  const removed = [];
  let hasMore = true;
  let nextCursor = cursor;

  console.log('Fetching transactions using Transactions Sync API...');

  try {
    while (hasMore) {
      const request = {
        access_token: PLAID_ACCESS_TOKEN,
      };
      if (nextCursor) {
        request.cursor = nextCursor;
      }

      const response = await client.transactionsSync(request);
      const data = response.data;

      added.push(...data.added);
      modified.push(...data.modified);
      removed.push(...data.removed);
      hasMore = data.has_more;
      nextCursor = data.next_cursor;

      console.log(`  Fetched ${data.added.length} added, ${data.modified.length} modified, ${data.removed.length} removed`);
    }

    console.log(`Total: ${added.length} added, ${modified.length} modified, ${removed.length} removed transactions`);

    return {
      added,
      modified,
      removed,
      cursor: nextCursor,
    };
  } catch (err) {
    throw new Error(`Transactions Sync failed: ${err.response?.data?.error_message || err.message}`);
  }
}

/**
 * Fallback: Fetch transactions using Transactions Get API
 */
async function fetchTransactionsGet() {
  console.log('Falling back to Transactions Get API...');
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - EXPORT_START_DAYS);

  const formatDate = (date) => date.toISOString().split('T')[0];

  let transactions = [];
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;

  try {
    while (hasMore) {
      const request = {
        access_token: PLAID_ACCESS_TOKEN,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        options: {
          count: batchSize,
          offset: offset,
        },
      };

      if (EXPORT_ACCOUNT_IDS) {
        request.options.account_ids = EXPORT_ACCOUNT_IDS;
      }

      const response = await client.transactionsGet(request);
      const data = response.data;

      transactions.push(...data.transactions);
      offset += data.transactions.length;
      hasMore = data.transactions.length === batchSize;

      console.log(`  Fetched ${data.transactions.length} transactions (total: ${transactions.length})`);
    }

    console.log(`Total: ${transactions.length} transactions fetched`);

    return {
      transactions,
      accounts: [], // We don't need accounts for the export
    };
  } catch (err) {
    throw new Error(`Transactions Get failed: ${err.response?.data?.error_message || err.message}`);
  }
}

/**
 * Normalize transactions for export
 */
function normalizeTransactions(transactions) {
  return transactions.map(t => ({
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    authorized_date: t.authorized_date || '',
    name: t.name || '',
    merchant_name: t.merchant_name || '',
    amount: t.amount,
    iso_currency_code: t.iso_currency_code || '',
    category: Array.isArray(t.category) ? t.category.join(' / ') : '',
    pending: t.pending ? 'Yes' : 'No',
    payment_channel: t.payment_channel || '',
    transaction_type: t.transaction_type || '',
  }));
}

/**
 * Filter transactions by account IDs if specified
 */
function filterTransactions(transactions) {
  if (!EXPORT_ACCOUNT_IDS || EXPORT_ACCOUNT_IDS.length === 0) {
    return transactions;
  }
  return transactions.filter(t => EXPORT_ACCOUNT_IDS.includes(t.account_id));
}

/**
 * Export transactions to XLSX
 */
async function exportToXLSX(transactions, filename) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transactions');

  // Define columns
  worksheet.columns = [
    { header: 'Transaction ID', key: 'transaction_id', width: 30 },
    { header: 'Account ID', key: 'account_id', width: 30 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Authorized Date', key: 'authorized_date', width: 15 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'Merchant Name', key: 'merchant_name', width: 30 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Currency', key: 'iso_currency_code', width: 10 },
    { header: 'Category', key: 'category', width: 30 },
    { header: 'Pending', key: 'pending', width: 10 },
    { header: 'Payment Channel', key: 'payment_channel', width: 15 },
    { header: 'Transaction Type', key: 'transaction_type', width: 15 },
  ];

  // Add rows
  transactions.forEach(t => {
    worksheet.addRow(t);
  });

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Write file
  await workbook.xlsx.writeFile(filename);
  console.log(`Exported to ${filename} (XLSX format)`);
}

/**
 * Export transactions to CSV
 */
function exportToCSV(transactions, filename) {
  const fields = [
    'transaction_id',
    'account_id',
    'date',
    'authorized_date',
    'name',
    'merchant_name',
    'amount',
    'iso_currency_code',
    'category',
    'pending',
    'payment_channel',
    'transaction_type',
  ];

  const parser = new Parser({ fields });
  const csv = parser.parse(transactions);

  fs.writeFileSync(filename, csv, 'utf8');
  console.log(`Exported to ${filename} (CSV format)`);
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Plaid Transactions Export Utility');
  console.log('='.repeat(60));
  console.log(`Environment: ${PLAID_ENV}`);
  console.log(`Export format: ${EXPORT_FORMAT.toUpperCase()}`);
  console.log(`Export directory: ${EXPORT_DIR}`);
  if (EXPORT_ACCOUNT_IDS) {
    console.log(`Filtering accounts: ${EXPORT_ACCOUNT_IDS.join(', ')}`);
  }
  console.log('='.repeat(60));

  // Ensure export directory exists
  const exportDirPath = path.isAbsolute(EXPORT_DIR) 
    ? EXPORT_DIR 
    : path.join(ROOT_DIR, EXPORT_DIR);
  
  if (!fs.existsSync(exportDirPath)) {
    fs.mkdirSync(exportDirPath, { recursive: true });
    console.log(`Created export directory: ${exportDirPath}`);
  }

  try {
    // Load cursor
    const cursor = loadCursor();
    console.log(cursor ? `Loaded cursor from file` : 'No cursor found, starting fresh');

    let allTransactions = [];

    if (cursor) {
      // Use Transactions Sync
      const syncData = await fetchTransactionsSync(cursor);
      
      // For a real-world implementation, you would:
      // 1. Load existing transactions from a database
      // 2. Apply added, modified, and removed transactions
      // 3. Save back to the database
      // For this script, we'll just export the newly added/modified transactions
      
      allTransactions = [...syncData.added, ...syncData.modified];
      
      // Save the new cursor
      saveCursor(syncData.cursor);
    } else {
      // First run - use Transactions Get as fallback
      console.log(`First run detected. Fetching last ${EXPORT_START_DAYS} days of transactions...`);
      
      try {
        // Try Transactions Sync first without cursor (gets all available transactions)
        const syncData = await fetchTransactionsSync(null);
        allTransactions = [...syncData.added];
        saveCursor(syncData.cursor);
      } catch (syncErr) {
        console.warn('Transactions Sync not available, falling back to Transactions Get');
        console.warn(`Error: ${syncErr.message}`);
        
        // Fallback to Transactions Get
        const getData = await fetchTransactionsGet();
        allTransactions = getData.transactions;
        
        // After successful fetch with Transactions Get, we can now initialize sync
        console.log('Initializing Transactions Sync for future runs...');
        try {
          const initSync = await fetchTransactionsSync(null);
          saveCursor(initSync.cursor);
        } catch (initErr) {
          console.warn('Could not initialize Transactions Sync cursor:', initErr.message);
        }
      }
    }

    // Filter transactions if account IDs specified
    const filteredTransactions = filterTransactions(allTransactions);
    console.log(`Transactions after filtering: ${filteredTransactions.length}`);

    if (filteredTransactions.length === 0) {
      console.log('No transactions to export');
      console.log('='.repeat(60));
      return;
    }

    // Normalize transactions
    const normalizedTransactions = normalizeTransactions(filteredTransactions);

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const extension = EXPORT_FORMAT === 'xlsx' ? 'xlsx' : 'csv';
    const filename = path.join(exportDirPath, `transactions_${date}.${extension}`);

    // Export based on format
    if (EXPORT_FORMAT === 'xlsx') {
      await exportToXLSX(normalizedTransactions, filename);
    } else {
      exportToCSV(normalizedTransactions, filename);
    }

    console.log('='.repeat(60));
    console.log('Export Summary:');
    console.log(`  Total transactions exported: ${normalizedTransactions.length}`);
    console.log(`  File: ${filename}`);
    console.log(`  Environment: ${PLAID_ENV}`);
    console.log('='.repeat(60));
    console.log('Export completed successfully!');

  } catch (err) {
    console.error('='.repeat(60));
    console.error('ERROR: Export failed');
    console.error(err.message);
    if (err.response?.data) {
      console.error('Plaid API error details:', JSON.stringify(err.response.data, null, 2));
    }
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

module.exports = { main };
