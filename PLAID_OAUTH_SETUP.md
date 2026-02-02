# Plaid OAuth Configuration Guide

This guide explains how to configure Plaid OAuth for use with Google Cloud Run backend and localhost frontend.

## Overview

Plaid OAuth is required for connecting to certain financial institutions (like Chase, Bank of America, Wells Fargo, etc.). This setup allows you to use OAuth with a backend deployed on Cloud Run while developing the frontend locally.

## Prerequisites

- Active Plaid account with Production access (for OAuth institutions)
- Backend deployed to Google Cloud Run
- Frontend running locally on `http://localhost:3000`

## Configuration Steps

### 1. Register Redirect URI in Plaid Dashboard

1. Navigate to the [Plaid Dashboard API Settings](https://dashboard.plaid.com/team/api)
2. Scroll to **"Allowed redirect URIs"** section
3. Add the following redirect URIs:
   - For local development: `http://localhost:3000/oauth-callback`
   - For local development (alternative): `http://localhost:3000/`
   - For production (when frontend is deployed): `https://your-frontend-domain.com/oauth-callback`
4. Click **"Save Changes"**

> **Note**: You can have multiple redirect URIs registered at the same time. This allows you to test both local and production setups.

### 2. Configure OAuth Institutions

1. Navigate to [US OAuth Institutions](https://dashboard.plaid.com/settings/compliance/us-oauth-institutions) in the Plaid Dashboard
2. Review the list of institutions that require OAuth
3. Complete the OAuth registration process for each institution you want to support:
   - Click on each institution
   - Fill out the required information
   - Submit for review

> **Important**: OAuth registration can take several days to several weeks depending on the institution. Chase and Charles Schwab typically have longer approval times.

### 3. Backend Environment Variables (Cloud Run)

Configure the following environment variables in Google Cloud Run:

```bash
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=production
PLAID_PRODUCTS=auth,transactions

# OAuth Redirect Configuration
# For localhost frontend development:
PLAID_REDIRECT_URI=http://localhost:3000/oauth-callback

# CORS Configuration
FRONTEND_URL=http://localhost:3000
```

**To set these via gcloud CLI**:

```bash
gcloud run services update plaid-service \
  --region us-west1 \
  --update-env-vars PLAID_CLIENT_ID=your_client_id \
  --update-env-vars PLAID_SECRET=your_secret \
  --update-env-vars PLAID_ENV=production \
  --update-env-vars PLAID_REDIRECT_URI=http://localhost:3000/oauth-callback \
  --update-env-vars FRONTEND_URL=http://localhost:3000 \
  --update-env-vars PLAID_PRODUCTS=auth,transactions
```

> **Security Note**: Never commit production credentials to version control. Always use Cloud Run's environment variable management or Google Secret Manager.

### 4. Frontend Environment Configuration

Create or update `frontend/.env`:

```env
REACT_APP_API_URL=https://plaid-service-982209115678.us-west1.run.app
```

This tells your frontend to connect to the Cloud Run backend instead of localhost.

### 5. Local Backend Environment (Optional)

If you're also running the backend locally for testing, configure `node/.env`:

```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=production
PLAID_REDIRECT_URI=http://localhost:3000/oauth-callback
FRONTEND_URL=http://localhost:3000
PLAID_PRODUCTS=auth,transactions
```

## Testing OAuth Flow

### 1. Start the Frontend

```bash
cd frontend
npm install
npm start
```

The frontend should now be running on `http://localhost:3000` and connecting to your Cloud Run backend.

### 2. Test Connection

1. Click **"Connect bank"** button in the UI
2. Search for an OAuth institution (e.g., "Chase", "Bank of America")
3. Select the institution
4. You should be redirected to the institution's OAuth login page
5. After successful authentication, you'll be redirected back to `http://localhost:3000/oauth-callback`
6. The OAuth flow should complete, and you should see your connected accounts

### 3. Troubleshooting OAuth Issues

#### "oauth uri does not contain a valid oauth_state_id query parameter"
- The redirect URI is not properly configured in the Plaid Dashboard
- Verify the URI matches exactly what's in the Dashboard

#### "Connectivity not supported" or "Institution not available"
- The institution may require OAuth registration
- Check your [OAuth Institutions dashboard](https://dashboard.plaid.com/settings/compliance/us-oauth-institutions)
- OAuth approval may still be pending

#### "Invalid redirect URI"
- The redirect URI in your environment variables doesn't match what's registered in the Plaid Dashboard
- Check both `PLAID_REDIRECT_URI` and the Plaid Dashboard settings

#### "CORS error" or "Network error"
- Verify `FRONTEND_URL` is set correctly in Cloud Run environment variables
- Check that the backend CORS configuration allows requests from your frontend origin

## OAuth Flow Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│  Frontend   │         │  Cloud Run   │         │  Plaid / Bank   │
│ (localhost) │         │   Backend    │         │      OAuth      │
└──────┬──────┘         └──────┬───────┘         └────────┬────────┘
       │                       │                          │
       │  1. Create Link Token │                          │
       ├──────────────────────>│                          │
       │                       │                          │
       │  2. Link Token        │                          │
       │<──────────────────────┤                          │
       │                       │                          │
       │  3. Open Plaid Link   │                          │
       │  (user selects bank)  │                          │
       │                       │                          │
       │  4. Redirect to Bank OAuth                       │
       ├──────────────────────────────────────────────────>│
       │                       │                          │
       │  5. User authenticates│                          │
       │                       │                          │
       │  6. OAuth callback with oauth_state_id           │
       │<──────────────────────────────────────────────────┤
       │  (to localhost:3000/oauth-callback)              │
       │                       │                          │
       │  7. Exchange public_token                        │
       ├──────────────────────>│                          │
       │                       │                          │
       │  8. Access token      │                          │
       │<──────────────────────┤                          │
       │                       │                          │
```

## Production Deployment

When you're ready to deploy your frontend to production:

1. **Update Frontend Environment**:
   ```env
   REACT_APP_API_URL=https://plaid-service-982209115678.us-west1.run.app
   ```

2. **Update Cloud Run Backend Environment**:
   ```bash
   gcloud run services update plaid-service \
     --region us-west1 \
     --update-env-vars PLAID_REDIRECT_URI=https://your-frontend-domain.com/oauth-callback \
     --update-env-vars FRONTEND_URL=https://your-frontend-domain.com
   ```

3. **Register Production Redirect URI**:
   - Add `https://your-frontend-domain.com/oauth-callback` to Plaid Dashboard

4. **Update CORS**: Ensure your frontend production URL is allowed in the backend CORS configuration

## Webhook Configuration (Optional)

If you need to receive webhooks from Plaid:

1. Set up a webhook endpoint in your backend (e.g., `/api/webhook`)
2. Configure the webhook URL in Cloud Run environment:
   ```bash
   PLAID_WEBHOOK_URL=https://plaid-service-982209115678.us-west1.run.app/api/webhook
   ```
3. Add the webhook URL to the Plaid Dashboard under [Webhooks](https://dashboard.plaid.com/developers/webhooks)

## Additional Resources

- [Plaid OAuth Documentation](https://plaid.com/docs/link/oauth/)
- [Plaid Dashboard](https://dashboard.plaid.com/)
- [OAuth Institutions Status](https://dashboard.plaid.com/settings/compliance/us-oauth-institutions)
- [Production Access Application](https://dashboard.plaid.com/overview/production)

## Security Best Practices

1. **Never commit credentials**: Use environment variables and keep `.env` files out of version control
2. **Use HTTPS in production**: OAuth requires HTTPS for production deployments
3. **Rotate secrets regularly**: Update your Plaid secrets periodically
4. **Monitor API usage**: Track your API usage in the Plaid Dashboard
5. **Use Google Secret Manager**: For production deployments, store secrets in Google Secret Manager instead of environment variables
