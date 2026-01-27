# Production Setup Guide for Hawaii Farming Plaid Integration

This guide will help you set up the Plaid integration with **live production data** for real financial institutions.

## Prerequisites

Before using production data, you must:

1. **Apply for Production Access**
   - Go to [Plaid Dashboard - Production Overview](https://dashboard.plaid.com/overview/production)
   - Complete the production access application
   - Wait for approval (typically 1-3 business days)

2. **Set Link Use Case**
   - Navigate to [Link Customization - Data Transparency](https://dashboard.plaid.com/link/data-transparency-v5)
   - Configure your use case for Link
   - This is **required** for production and prevents "something went wrong" errors

3. **Configure OAuth for Institutions** (if needed)
   - Many major institutions (Chase, Wells Fargo, Fidelity, Schwab) require OAuth
   - Check your OAuth status at [US OAuth Institutions](https://dashboard.plaid.com/settings/compliance/us-oauth-institutions)
   - Complete any required OAuth registration steps

## Production Setup Steps

### 1. Get Production API Keys

1. Navigate to [Plaid Dashboard - Team Keys](https://dashboard.plaid.com/team/keys)
2. Switch to the **Production** environment
3. Copy your **Production Client ID** and **Production Secret**
4. **IMPORTANT**: Never commit these keys to version control

### 2. Configure Environment Variables

Create a `.env` file (never commit this file):

```bash
cp .env.example .env
```

Edit `.env` with your production credentials:

```bash
# Production API Keys
PLAID_CLIENT_ID=your_production_client_id_here
PLAID_SECRET=your_production_secret_here

# Set environment to production
PLAID_ENV=production

# Configure products you're approved for
# Remove products you don't use to avoid billing
PLAID_PRODUCTS=auth,transactions

# Set your country codes
PLAID_COUNTRY_CODES=US

# OAuth redirect URI (if using OAuth)
# Must be registered in Plaid Dashboard under Developers > API > Allowed redirect URIs
# For production, must use HTTPS
PLAID_REDIRECT_URI=https://yourdomain.com/oauth-callback
```

### 3. Configure Export Script for Production

Add these to your `.env` file:

```bash
# Export configuration
EXPORT_FORMAT=xlsx
EXPORT_DIR=./exports
EXPORT_START_DAYS=30

# This will be set after linking an account (see step 4)
PLAID_ACCESS_TOKEN=
```

### 4. Link a Real Bank Account

**Option A: Using the UI (Recommended for first-time setup)**

1. Start the backend server:
   ```bash
   cd node
   npm install
   npm start
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

3. Open http://localhost:3000 in your browser

4. Click "Link Account" and connect a **real** bank account using **real credentials**

5. After successful linking, check your Node backend console logs for the `access_token`

6. Copy the `access_token` and add it to your `.env` file:
   ```bash
   PLAID_ACCESS_TOKEN=access-production-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

**Option B: Using the API directly**

If you already have production access tokens from another system, you can use them directly by setting `PLAID_ACCESS_TOKEN` in your `.env` file.

### 5. Secure Your Production Access Token

**CRITICAL SECURITY CONSIDERATIONS:**

The access token is equivalent to a password for accessing financial data. In production:

1. **Never** commit access tokens to version control (`.env` is already in `.gitignore`)
2. **Store tokens securely** in a proper secrets management system:
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - Encrypted database
3. **Rotate tokens regularly** using Plaid's token rotation API
4. **Use separate tokens** for different users/accounts
5. **Monitor token usage** via the Plaid Dashboard

For the export script in production environments:
- Use environment variables or secrets management
- Never hardcode tokens in scripts
- Implement proper access controls
- Log all export operations for audit purposes

### 6. Test Production Setup

Test the export script with real data:

```bash
# From the repository root
node scripts/export-transactions.js
```

Expected output:
```
============================================================
Plaid Transactions Export Utility
============================================================
Environment: production
Export format: XLSX
Export directory: ./exports
============================================================
```

The script will:
- Fetch real transaction data from your linked bank account
- Create an export file in `./exports/transactions_YYYY-MM-DD.xlsx`
- Save a cursor in `scripts/cursor.json` for incremental updates

### 7. Set Up Automated Exports (Optional)

For automated daily/weekly exports, see the scheduling options in the [README](README.md#scheduling).

**Production Considerations:**
- Use a secure server or CI/CD environment
- Store credentials in secrets management
- Set up monitoring and alerting
- Implement error handling and retry logic
- Archive exports to secure storage

## Production Best Practices

### Security

1. **API Keys**
   - Store in environment variables or secrets manager
   - Rotate regularly
   - Use different keys for different environments
   - Never log API keys or secrets

2. **Access Tokens**
   - Store securely per-user in encrypted database
   - Implement token rotation
   - Monitor for suspicious activity
   - Revoke tokens when users disconnect accounts

3. **Data Storage**
   - Encrypt exports at rest and in transit
   - Implement access controls
   - Comply with data retention policies
   - Follow PCI DSS and other relevant standards

### Error Handling

1. **Monitor Plaid Dashboard**
   - Check [Activity Logs](https://dashboard.plaid.com/activity/logs) regularly
   - Set up alerts for errors
   - Track API usage and rate limits

2. **Handle Common Errors**
   - Item login required (user needs to re-authenticate)
   - Institution down (temporary, retry later)
   - Rate limits (implement exponential backoff)
   - Invalid credentials (prompt user to update)

### Compliance

1. **Data Usage**
   - Only request products you need
   - Follow Plaid's Acceptable Use Policy
   - Implement proper user consent flows
   - Maintain data minimization practices

2. **User Privacy**
   - Provide clear privacy policy
   - Allow users to disconnect accounts
   - Delete data when users request it
   - Follow GDPR/CCPA requirements if applicable

## Production Checklist

Before going live with production data:

- [ ] Production access approved by Plaid
- [ ] Link use case configured in dashboard
- [ ] OAuth registrations complete (if needed)
- [ ] Production API keys obtained
- [ ] Environment variables configured
- [ ] Access tokens stored securely
- [ ] Export script tested with real data
- [ ] Secrets never committed to version control
- [ ] Error handling implemented
- [ ] Monitoring and logging set up
- [ ] Security review completed
- [ ] Compliance requirements met
- [ ] Backup and recovery plan in place

## Troubleshooting Production Issues

### "Something went wrong" or "INVALID_SERVER_ERROR"

**Solution:** Set a use case for Link
- Go to [Link Customization - Data Transparency](https://dashboard.plaid.com/link/data-transparency-v5)
- Configure your use case

### "You need to update your app" or "institution not supported"

**Solution:** Complete OAuth registration
- Check [US OAuth Institutions](https://dashboard.plaid.com/settings/compliance/us-oauth-institutions)
- Complete any required steps for the institution

### "ITEM_LOGIN_REQUIRED"

**Solution:** User needs to re-authenticate
- Prompt the user to update their login credentials
- Use Link in update mode to re-authenticate

### Export script fails with API errors

**Solution:** Check several things:
1. Verify `PLAID_ENV=production` in `.env`
2. Verify using production Client ID and Secret
3. Verify access token is for production environment
4. Check [Dashboard Activity Logs](https://dashboard.plaid.com/activity/logs)

### Cursor errors when switching environments

**Solution:** Use separate cursors per environment
- Rename `scripts/cursor.json` when switching
- Example: `cursor-sandbox.json`, `cursor-production.json`

## Getting Help

- **Plaid Dashboard**: https://dashboard.plaid.com
- **Plaid Documentation**: https://plaid.com/docs
- **Activity Logs**: https://dashboard.plaid.com/activity/logs
- **Support**: https://dashboard.plaid.com/support/new

## Migration from Sandbox to Production

When moving from sandbox to production:

1. **Update all environment variables** to use production values
2. **Re-link accounts** with real credentials (sandbox tokens don't work in production)
3. **Reset cursor** by renaming or deleting `scripts/cursor.json`
4. **Test thoroughly** with small data sets first
5. **Monitor closely** in the first few days
6. **Set up proper alerting** for errors and anomalies

---

**IMPORTANT REMINDER**: This repository is currently using in-memory storage for access tokens (`node/index.js`). For production use, you **must** implement proper database storage and security measures. The current implementation is for demonstration purposes only.
