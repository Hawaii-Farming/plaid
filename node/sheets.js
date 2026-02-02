'use strict';

const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const SPREADSHEET_ID = '1sSWZeFkIWUl3ty1NYaycPk58YaJSEy0xhVmPe2Z_0jU';
const SHEET_NAME = 'Transactions'; // Change this if your sheet tab has a different name

let sheetsClient = null;

async function initSheetsClient() {
  if (sheetsClient) return sheetsClient;

  try {
    // Get service account credentials from Secret Manager
    const secretClient = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'aloha-96743';
    const secretName = `projects/${projectId}/secrets/plaid-sheets-service-account/versions/latest`;
    
    const [version] = await secretClient.accessSecretVersion({ name: secretName });
    const serviceAccountKey = JSON.parse(version.payload.data.toString());

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (error) {
    console.error('Failed to initialize Sheets client:', error);
    throw error;
  }
}

async function ensureHeadersExist() {
  const sheets = await initSheetsClient();
  
  try {
    // Check if headers exist
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:H1`,
    });

    if (!response.data.values || response.data.values.length === 0) {
      // Add headers
      const headers = [['Date', 'Account', 'Description', 'Amount', 'Category', 'Merchant', 'Status', 'Currency']];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:H1`,
        valueInputOption: 'RAW',
        resource: { values: headers },
      });
      console.log('✅ Headers added to spreadsheet');
    }
  } catch (error) {
    console.error('Error ensuring headers:', error.message);
    throw error;
  }
}

async function getExistingTransactionIds() {
  const sheets = await initSheetsClient();
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!I:I`, // Column I will store transaction IDs (hidden)
    });

    if (!response.data.values) return new Set();
    
    return new Set(response.data.values.flat().filter(Boolean));
  } catch (error) {
    console.log('No existing transaction IDs found (this is normal for first run)');
    return new Set();
  }
}

async function appendTransactions(transactions) {
  const sheets = await initSheetsClient();
  
  try {
    await ensureHeadersExist();
    const existingIds = await getExistingTransactionIds();
    
    // Filter out duplicates
    const newTransactions = transactions.filter(t => !existingIds.has(t.transaction_id));
    
    if (newTransactions.length === 0) {
      console.log('No new transactions to add');
      return { added: 0, skipped: transactions.length };
    }

    // Format data for sheets
    const rows = newTransactions.map(t => [
      t.date,
      t.account_id,
      t.name,
      t.amount,
      t.category?.join(' / ') || '',
      t.merchant_name || '',
      t.pending ? 'Pending' : 'Posted',
      t.iso_currency_code || 'USD',
      t.transaction_id, // Hidden column for deduplication
    ]);

    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: rows },
    });

    console.log(`✅ Added ${newTransactions.length} new transactions to spreadsheet`);
    return { added: newTransactions.length, skipped: transactions.length - newTransactions.length };
  } catch (error) {
    console.error('Error appending transactions:', error.message);
    throw error;
  }
}

module.exports = {
  appendTransactions,
  initSheetsClient,
};
