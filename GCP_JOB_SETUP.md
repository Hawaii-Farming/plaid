# GCP Job Setup Guide

This guide covers setting up automated Google Cloud Platform (GCP) jobs to extract Plaid transaction data without requiring user re-authentication.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Authentication Setup](#authentication-setup)
- [Cloud Scheduler Setup](#cloud-scheduler-setup)
- [Cloud Functions Example](#cloud-functions-example)
- [Cloud Run Jobs Example](#cloud-run-jobs-example)
- [Testing and Validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)

## Overview

The backend now provides persistent token storage, enabling automated jobs to:
1. Retrieve active access tokens via API
2. Fetch transaction data from Plaid
3. Export to Excel, CSV, or Google Sheets
4. Run on a schedule without user intervention

## Prerequisites

1. **Backend running with database enabled**
   - Follow [PRODUCTION_DATABASE_SETUP.md](PRODUCTION_DATABASE_SETUP.md)
   - Verify: `curl http://your-backend-url/api/health/db`

2. **At least one active token in database**
   - Link a bank account through the UI
   - Verify: `curl -H "X-API-Key: your_key" http://your-backend-url/api/tokens`

3. **API key configured**
   - Set `API_KEY` environment variable in backend
   - Store in GCP Secret Manager for jobs

4. **GCP Project with billing enabled**
   - Cloud Scheduler API enabled
   - Cloud Functions or Cloud Run Jobs enabled
   - Service account with appropriate permissions

## Authentication Setup

### Step 1: Create API Key

Generate a secure random API key for your backend:

```bash
# Generate random key
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 2: Store in Secret Manager

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create secret
echo -n "your_generated_api_key" | gcloud secrets create plaid-api-key --data-file=-

# Verify
gcloud secrets versions access latest --secret="plaid-api-key"
```

### Step 3: Configure Backend

Update backend environment variables:

```bash
# In .env or Cloud Run environment
API_KEY=your_generated_api_key
```

Restart backend to apply changes.

### Step 4: Grant Access to Service Account

```bash
# Create service account for jobs
gcloud iam service-accounts create plaid-export-job \
  --display-name="Plaid Transaction Export Job"

# Grant secret access
gcloud secrets add-iam-policy-binding plaid-api-key \
  --member="serviceAccount:plaid-export-job@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Cloud Scheduler Setup

Cloud Scheduler triggers your job on a schedule.

### Create Schedule

```bash
# Daily at 2 AM UTC
gcloud scheduler jobs create http plaid-daily-export \
  --location=us-central1 \
  --schedule="0 2 * * *" \
  --time-zone="America/New_York" \
  --uri="https://REGION-PROJECT_ID.cloudfunctions.net/plaidExport" \
  --http-method=POST \
  --oidc-service-account-email=plaid-export-job@PROJECT_ID.iam.gserviceaccount.com \
  --oidc-token-audience="https://REGION-PROJECT_ID.cloudfunctions.net/plaidExport" \
  --headers="Content-Type=application/json" \
  --message-body='{"format":"xlsx","start_days_ago":30,"end_days_ago":0}'
```

### Schedule Examples

```bash
# Daily at 2 AM
--schedule="0 2 * * *"

# Every Monday at 6 AM
--schedule="0 6 * * 1"

# First day of every month at midnight
--schedule="0 0 1 * *"

# Every 6 hours
--schedule="0 */6 * * *"

# Weekdays at 9 AM
--schedule="0 9 * * 1-5"
```

### Test Schedule Manually

```bash
gcloud scheduler jobs run plaid-daily-export --location=us-central1
```

## Cloud Functions Example

### Step 1: Create Function Directory

```bash
mkdir plaid-export-function
cd plaid-export-function
```

### Step 2: Create package.json

```json
{
  "name": "plaid-export-function",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.3.0",
    "@google-cloud/secret-manager": "^5.0.0",
    "@google-cloud/storage": "^7.7.0",
    "axios": "^1.6.5",
    "exceljs": "^4.4.0"
  }
}
```

### Step 3: Create index.js

```javascript
const functions = require('@google-cloud/functions-framework');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const ExcelJS = require('exceljs');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://your-backend-url.com';
const BUCKET_NAME = process.env.BUCKET_NAME || 'plaid-exports';
const PROJECT_ID = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;

// Initialize clients
const secretClient = new SecretManagerServiceClient();
const storage = new Storage();

/**
 * Get API key from Secret Manager
 */
async function getApiKey() {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/plaid-api-key/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

/**
 * Get active token from backend
 */
async function getActiveToken(apiKey) {
  const response = await axios.get(`${BACKEND_URL}/api/tokens/active`, {
    headers: { 'X-API-Key': apiKey }
  });
  return response.data;
}

/**
 * Fetch transactions from backend
 */
async function fetchTransactions(apiKey, startDate, endDate, accessToken) {
  const response = await axios.post(
    `${BACKEND_URL}/api/transactions`,
    { start_date: startDate, end_date: endDate },
    { headers: { 'X-API-Key': apiKey } }
  );
  return response.data;
}

/**
 * Create Excel workbook from transactions
 */
async function createExcelWorkbook(transactions, accounts) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transactions');
  
  // Add headers
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Account ID', key: 'account_id', width: 20 },
    { header: 'Pending', key: 'pending', width: 10 },
  ];
  
  // Add data
  transactions.forEach(txn => {
    worksheet.addRow({
      date: txn.date,
      name: txn.name,
      amount: txn.amount,
      category: txn.category?.join(' / ') || '',
      account_id: txn.account_id,
      pending: txn.pending ? 'Yes' : 'No',
    });
  });
  
  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  return workbook;
}

/**
 * Upload file to Cloud Storage
 */
async function uploadToStorage(buffer, filename) {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filename);
  
  await file.save(buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });
  
  console.log(`File uploaded to gs://${BUCKET_NAME}/${filename}`);
  return `gs://${BUCKET_NAME}/${filename}`;
}

/**
 * Main function handler
 */
functions.http('plaidExport', async (req, res) => {
  try {
    console.log('Starting Plaid export job...');
    
    // Parse request body
    const { format = 'xlsx', start_days_ago = 30, end_days_ago = 0 } = req.body || {};
    
    // Calculate dates
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - end_days_ago);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - start_days_ago);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`Fetching transactions from ${startDateStr} to ${endDateStr}`);
    
    // Get API key
    const apiKey = await getApiKey();
    
    // Get active token
    const tokenData = await getActiveToken(apiKey);
    console.log(`Using token for item: ${tokenData.item_id}`);
    
    // Fetch transactions
    const data = await fetchTransactions(apiKey, startDateStr, endDateStr, tokenData.access_token);
    console.log(`Fetched ${data.transactions.length} transactions`);
    
    // Create Excel workbook
    const workbook = await createExcelWorkbook(data.transactions, data.accounts);
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Upload to Cloud Storage
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `transactions_${timestamp}.xlsx`;
    const fileUri = await uploadToStorage(buffer, filename);
    
    console.log('Export completed successfully');
    
    res.status(200).json({
      success: true,
      message: 'Export completed',
      file: fileUri,
      transaction_count: data.transactions.length,
      date_range: { start: startDateStr, end: endDateStr }
    });
    
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Step 4: Deploy Function

```bash
# Create bucket for exports
gsutil mb gs://plaid-exports-PROJECT_ID

# Deploy function
gcloud functions deploy plaidExport \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=plaidExport \
  --trigger-http \
  --allow-unauthenticated=false \
  --service-account=plaid-export-job@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="BACKEND_URL=https://your-backend-url.com,BUCKET_NAME=plaid-exports-PROJECT_ID"

# Grant Storage permissions
gsutil iam ch serviceAccount:plaid-export-job@PROJECT_ID.iam.gserviceaccount.com:objectCreator \
  gs://plaid-exports-PROJECT_ID
```

### Step 5: Test Function

```bash
# Get function URL
FUNCTION_URL=$(gcloud functions describe plaidExport --gen2 --region=us-central1 --format="value(serviceConfig.uri)")

# Test with gcloud (uses your credentials)
gcloud functions call plaidExport \
  --region=us-central1 \
  --gen2 \
  --data='{"format":"xlsx","start_days_ago":30,"end_days_ago":0}'

# Or test with curl (requires auth token)
curl -X POST $FUNCTION_URL \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{"format":"xlsx","start_days_ago":30,"end_days_ago":0}'
```

## Cloud Run Jobs Example

Cloud Run Jobs provide more control and flexibility than Cloud Functions.

### Step 1: Create Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "export-job.js"]
```

### Step 2: Create export-job.js

```javascript
const axios = require('axios');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Storage } = require('@google-cloud/storage');
const ExcelJS = require('exceljs');

const BACKEND_URL = process.env.BACKEND_URL;
const BUCKET_NAME = process.env.BUCKET_NAME;
const START_DAYS_AGO = parseInt(process.env.START_DAYS_AGO || '30');
const END_DAYS_AGO = parseInt(process.env.END_DAYS_AGO || '0');
const PROJECT_ID = process.env.GCP_PROJECT;

async function main() {
  try {
    console.log('Starting Plaid transaction export job...');
    
    // Get API key from Secret Manager
    const secretClient = new SecretManagerServiceClient();
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/plaid-api-key/versions/latest`,
    });
    const apiKey = version.payload.data.toString('utf8');
    
    // Calculate date range
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - END_DAYS_AGO);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - START_DAYS_AGO);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`Date range: ${startDateStr} to ${endDateStr}`);
    
    // Get active token
    const tokenResponse = await axios.get(`${BACKEND_URL}/api/tokens/active`, {
      headers: { 'X-API-Key': apiKey }
    });
    const { access_token, item_id } = tokenResponse.data;
    console.log(`Using token for item: ${item_id}`);
    
    // Fetch transactions
    const txnResponse = await axios.post(
      `${BACKEND_URL}/api/transactions`,
      { start_date: startDateStr, end_date: endDateStr },
      { headers: { 'X-API-Key': apiKey } }
    );
    
    const { transactions, accounts } = txnResponse.data;
    console.log(`Fetched ${transactions.length} transactions`);
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');
    
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Account', key: 'account_id', width: 20 },
    ];
    
    transactions.forEach(txn => {
      worksheet.addRow({
        date: txn.date,
        name: txn.name,
        amount: txn.amount,
        category: txn.category?.join(' / ') || '',
        account_id: txn.account_id,
      });
    });
    
    // Upload to Cloud Storage
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `transactions_${timestamp}.xlsx`;
    
    const storage = new Storage();
    await storage.bucket(BUCKET_NAME).file(filename).save(buffer);
    
    console.log(`✅ Export completed: gs://${BUCKET_NAME}/${filename}`);
    console.log(`📊 Exported ${transactions.length} transactions`);
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

main();
```

### Step 3: Build and Deploy

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT_ID/plaid-export-job

# Create Cloud Run Job
gcloud run jobs create plaid-export-job \
  --image=gcr.io/PROJECT_ID/plaid-export-job \
  --region=us-central1 \
  --service-account=plaid-export-job@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="BACKEND_URL=https://your-backend-url.com,BUCKET_NAME=plaid-exports,GCP_PROJECT=PROJECT_ID,START_DAYS_AGO=30,END_DAYS_AGO=0" \
  --max-retries=3 \
  --task-timeout=10m

# Execute job manually
gcloud run jobs execute plaid-export-job --region=us-central1

# View logs
gcloud run jobs executions logs read --region=us-central1
```

### Step 4: Schedule with Cloud Scheduler

```bash
gcloud scheduler jobs create http plaid-export-schedule \
  --location=us-central1 \
  --schedule="0 2 * * *" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/plaid-export-job:run" \
  --http-method=POST \
  --oauth-service-account-email=plaid-export-job@PROJECT_ID.iam.gserviceaccount.com
```

## Testing and Validation

### Test Backend Endpoints

```bash
# Set your API key
export API_KEY="your_api_key_here"
export BACKEND_URL="https://your-backend-url.com"

# Test health
curl $BACKEND_URL/api/health
curl $BACKEND_URL/api/health/db

# Test token retrieval
curl -H "X-API-Key: $API_KEY" $BACKEND_URL/api/tokens
curl -H "X-API-Key: $API_KEY" $BACKEND_URL/api/tokens/active

# Test transaction fetch
curl -X POST $BACKEND_URL/api/transactions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"start_date":"2024-01-01","end_date":"2024-12-31"}'
```

### Validate Cloud Storage

```bash
# List exports
gsutil ls gs://plaid-exports-PROJECT_ID/

# Download latest export
gsutil cp gs://plaid-exports-PROJECT_ID/transactions_*.xlsx .
```

### Monitor Job Execution

```bash
# Cloud Functions
gcloud functions logs read plaidExport --region=us-central1 --limit=50

# Cloud Run Jobs
gcloud run jobs executions list --region=us-central1
gcloud run jobs executions logs read EXECUTION_ID --region=us-central1

# Cloud Scheduler
gcloud scheduler jobs describe plaid-daily-export --location=us-central1
```

## Troubleshooting

### "Unauthorized" Error

**Problem:** 401 error when calling backend

**Solutions:**
1. Verify API_KEY is set in backend
2. Check secret is accessible:
   ```bash
   gcloud secrets versions access latest --secret=plaid-api-key
   ```
3. Verify service account has secret access
4. Check X-API-Key header is being sent correctly

### "No active token found"

**Problem:** 404 error from `/api/tokens/active`

**Solutions:**
1. Verify token exists in database:
   ```sql
   SELECT * FROM plaid_tokens WHERE is_active = true;
   ```
2. Link a bank account through the UI
3. Check database connection in backend logs

### Function Timeout

**Problem:** Cloud Function times out

**Solutions:**
1. Increase timeout: `--timeout=540s` (max 9 minutes for gen2)
2. Reduce date range (fewer transactions)
3. Use Cloud Run Jobs instead (longer timeout)

### Storage Permission Denied

**Problem:** Cannot write to Cloud Storage bucket

**Solutions:**
1. Grant permissions:
   ```bash
   gsutil iam ch serviceAccount:SA_EMAIL:objectCreator gs://BUCKET
   ```
2. Verify bucket exists: `gsutil ls`
3. Check service account in job configuration

### Database Connection Failed

**Problem:** Backend cannot connect to database

**Solutions:**
1. Check Cloud SQL instance is running
2. Verify DATABASE_URL in backend environment
3. Check authorized networks/VPC configuration
4. Review [PRODUCTION_DATABASE_SETUP.md](PRODUCTION_DATABASE_SETUP.md)

## Advanced: Export to Google Sheets

To export directly to Google Sheets instead of Cloud Storage:

```javascript
const { google } = require('googleapis');

async function exportToGoogleSheets(transactions, spreadsheetId) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  const values = [
    ['Date', 'Name', 'Amount', 'Category', 'Account'],
    ...transactions.map(t => [
      t.date,
      t.name,
      t.amount,
      t.category?.join(' / ') || '',
      t.account_id
    ])
  ];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Transactions!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}
```

## Next Steps

1. **Set up monitoring:**
   - Create Cloud Monitoring alerts for job failures
   - Set up log-based metrics

2. **Implement notifications:**
   - Send email on completion/failure
   - Post to Slack/Teams

3. **Add data transformation:**
   - Categorize transactions
   - Calculate summaries
   - Generate reports

4. **Implement data retention:**
   - Lifecycle rules for old exports
   - Archive to cheaper storage

## Support

- **Backend issues:** Check application logs and health endpoints
- **GCP issues:** Review Cloud Functions/Run logs
- **Plaid API issues:** [Plaid Dashboard](https://dashboard.plaid.com/support)
