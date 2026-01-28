#!/usr/bin/env node
/**
 * Export Plaid transactions directly to Google Sheets via service account.
 * Required env:
 *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ACCESS_TOKEN, PLAID_ENV
 *   GOOGLE_SHEET_ID
 *   GCP_SA_JSON   // service account JSON (string)
 *
 * Optional:
 *   EXPORT_ACCOUNT_IDS    // comma-separated filter
 *   EXPORT_START_DAYS=30  // lookback window
 *   SHEETS_RANGE=Sheet1!A1
 */
'use strict';

const path = require('path');

// Match quickstart module resolution (node/node_modules)
const nodeModulesPath = path.join(__dirname, '..', 'node', 'node_modules');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${nodeModulesPath}${path.delimiter}${process.env.NODE_PATH}`
  : nodeModulesPath;
require('module').Module._initPaths();

// Load env from repo root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { google } = require('googleapis');

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ACCESS_TOKEN = process.env.PLAID_ACCESS_TOKEN;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const EXPORT_ACCOUNT_IDS = process.env.EXPORT_ACCOUNT_IDS
  ? process.env.EXPORT_ACCOUNT_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : null;
const EXPORT_START_DAYS = parseInt(process.env.EXPORT_START_DAYS || '30', 10);
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEETS_RANGE = process.env.SHEETS_RANGE || 'Sheet1!A1';
const GCP_SA_JSON = process.env.GCP_SA_JSON;

function assertEnv(vars) {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}
function daysAgoIso(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

function plaidClient() {
  const config = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  return new PlaidApi(config);
}

async function fetchTransactions(client, accessToken, accountIds, lookbackDays) {
  const start_date = daysAgoIso(lookbackDays);
  const end_date = new Date().toISOString().slice(0, 10);
  const PAGE_SIZE = 500;
  let offset = 0, total = 1;
  let transactions = [];
  let accountsMap = {};
  while (offset < total) {
    const resp = await client.transactionsGet({
      access_token: accessToken,
      start_date,
      end_date,
      options: { offset, count: PAGE_SIZE, account_ids: accountIds || undefined },
    });
    const { transactions: txns, total_transactions, accounts } = resp.data;
    total = total_transactions;
    offset += txns.length;
    transactions = transactions.concat(txns);
    if (accounts) accounts.forEach(a => { accountsMap[a.account_id] = a; });
    console.log(`Fetched ${transactions.length}/${total} transactions...`);
  }
  return { transactions, accountsMap };
}

function toSheetRows(transactions, accountsMap) {
  const header = [
    'date','name','amount','account_id','account_name','pending','merchant_name','category','iso_currency_code',
  ];
  const rows = transactions.map(t => {
    const acct = accountsMap[t.account_id];
    return [
      t.date,
      t.name,
      t.amount,
      t.account_id,
      acct ? acct.name : '',
      t.pending ? 'yes' : 'no',
      t.merchant_name || '',
      (t.category || []).join(' > '),
      t.iso_currency_code || t.unofficial_currency_code || '',
    ];
  });
  return [header, ...rows];
}

async function sheetsClient() {
  if (!GCP_SA_JSON) throw new Error('GCP_SA_JSON is required');
  const credentials = JSON.parse(GCP_SA_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function writeToSheet(sheets, spreadsheetId, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

(async () => {
  try {
    assertEnv(['PLAID_CLIENT_ID','PLAID_SECRET','PLAID_ACCESS_TOKEN','GOOGLE_SHEET_ID','GCP_SA_JSON']);
    const client = plaidClient();
    console.log('Fetching transactions from Plaid...');
    const { transactions, accountsMap } = await fetchTransactions(
      client, PLAID_ACCESS_TOKEN, EXPORT_ACCOUNT_IDS, EXPORT_START_DAYS
    );
    console.log(`Fetched ${transactions.length} transactions. Building sheet rows...`);
    const rows = toSheetRows(transactions, accountsMap);
    const sheets = await sheetsClient();
    console.log(`Writing to Google Sheet ${GOOGLE_SHEET_ID} at range ${SHEETS_RANGE}...`);
    await writeToSheet(sheets, GOOGLE_SHEET_ID, SHEETS_RANGE, rows);
    console.log('Done. Transactions written to Google Sheets.');
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exit(1);
  }
})();
