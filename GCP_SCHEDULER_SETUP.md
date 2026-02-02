# Google Cloud Scheduler Setup

## Overview

This guide explains how to set up automated transaction exports using Google Cloud Scheduler.

## Prerequisites

- Cloud Run service deployed and running
- `gcloud` CLI installed and authenticated
- API key configured in Cloud Run environment variables

## Create API Key

Generate a secure random API key:

```bash
# Generate a random API key
API_KEY=$(openssl rand -base64 32)
echo $API_KEY

# Add it to Cloud Run
gcloud run services update plaid-service \
  --region us-west1 \
  --set-env-vars API_KEY=$API_KEY
```

## Create Scheduled Job

### Daily Export at 2 AM

**Important**: Replace `YOUR_API_KEY` in the commands below with the actual API key you generated above.

```bash
gcloud scheduler jobs create http plaid-daily-export \
  --location=us-west1 \
  --schedule="0 2 * * *" \
  --uri="https://plaid-service-982209115678.us-west1.run.app/api/scheduled-export" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-API-Key=YOUR_API_KEY" \
  --message-body='{"format":"xlsx","days":7}'
```

Replace `YOUR_API_KEY` with the API key you generated above.

### Weekly Export

```bash
gcloud scheduler jobs create http plaid-weekly-export \
  --location=us-west1 \
  --schedule="0 2 * * 0" \
  --uri="https://plaid-service-982209115678.us-west1.run.app/api/scheduled-export" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-API-Key=YOUR_API_KEY" \
  --message-body='{"format":"xlsx","days":30}'
```

### Monthly Export

```bash
gcloud scheduler jobs create http plaid-monthly-export \
  --location=us-west1 \
  --schedule="0 2 1 * *" \
  --uri="https://plaid-service-982209115678.us-west1.run.app/api/scheduled-export" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-API-Key=YOUR_API_KEY" \
  --message-body='{"format":"xlsx","days":90}'
```

## Schedule Syntax

Cloud Scheduler uses cron format:

```
* * * * *
| | | | |
| | | | +- Day of week (0-6, Sunday=0)
| | | +--- Month (1-12)
| | +----- Day of month (1-31)
| +------- Hour (0-23)
+--------- Minute (0-59)
```

Examples:
- `0 2 * * *` - Daily at 2:00 AM
- `0 2 * * 0` - Weekly on Sunday at 2:00 AM
- `0 2 1 * *` - Monthly on 1st day at 2:00 AM
- `*/30 * * * *` - Every 30 minutes

## Backend Endpoint

The `/api/scheduled-export` endpoint is already implemented in `node/index.js`.

### Request Format

```json
{
  "format": "xlsx",  // or "csv"
  "days": 30         // number of days to export
}
```

### Response Format

```json
{
  "success": true,
  "transactions": 150,
  "exported_at": "2024-01-15T02:00:00.000Z",
  "start_date": "2023-12-16",
  "end_date": "2024-01-15"
}
```

## Testing the Endpoint

Test manually with curl:

```bash
curl -X POST \
  https://plaid-service-982209115678.us-west1.run.app/api/scheduled-export \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"format":"xlsx","days":7}'
```

## Managing Scheduled Jobs

### List all jobs

```bash
gcloud scheduler jobs list --location=us-west1
```

### View job details

```bash
gcloud scheduler jobs describe plaid-daily-export --location=us-west1
```

### Run job immediately (for testing)

```bash
gcloud scheduler jobs run plaid-daily-export --location=us-west1
```

### Update job

```bash
gcloud scheduler jobs update http plaid-daily-export \
  --location=us-west1 \
  --schedule="0 3 * * *"
```

### Delete job

```bash
gcloud scheduler jobs delete plaid-daily-export --location=us-west1
```

## Monitoring

### View job logs

```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=plaid-daily-export" \
  --limit 50 \
  --format json
```

### View Cloud Run logs

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=plaid-service" \
  --limit 50
```

## Security Notes

1. **Never commit the API key** to version control
2. Store the API key securely in Cloud Run environment variables
3. Rotate the API key periodically
4. Monitor Cloud Run logs for unauthorized access attempts
5. Consider using Cloud Run service accounts for additional security

## Extending Functionality

You can extend the scheduled export endpoint to:
- Save exports to Cloud Storage
- Send exports to Google Sheets
- Email exports via SendGrid or similar
- Post to Slack/Discord webhooks
- Store in BigQuery for analysis

Example integration with Cloud Storage:

```javascript
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();

app.post('/api/scheduled-export', async (req, res) => {
  // ... existing code ...
  
  // Save to Cloud Storage
  const bucket = storage.bucket('plaid-exports');
  const filename = `transactions-${new Date().toISOString()}.xlsx`;
  const file = bucket.file(filename);
  
  await file.save(exportData);
  
  res.json({ 
    success: true,
    file_url: `gs://plaid-exports/${filename}`
  });
});
```
