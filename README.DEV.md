# Local Development Guide

## Overview

This guide explains how to run the Plaid integration locally for development.

## Run Backend Only

```bash
cd node
npm install
npm start
# Backend runs on http://localhost:8000
```

## Run Frontend Only

```bash
cd frontend
npm install
npm start
# Frontend runs on http://localhost:3000
# Proxies API calls to localhost:8000
```

## Run Both (Simulating Cloud Run)

This simulates the production environment where the backend serves the frontend.

```bash
# Terminal 1: Build frontend
cd frontend
npm run build

# Terminal 2: Run backend (serves frontend build)
cd node
npm start
# Visit http://localhost:8000
```

## Environment Variables

### Backend (`node/.env`)

```env
PLAID_CLIENT_ID=your_sandbox_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
PLAID_REDIRECT_URI=http://localhost:8000/oauth-callback
PORT=8000
```

### Frontend (`frontend/.env.development`)

Create this file if you need to customize the backend URL:

```env
REACT_APP_API_URL=http://localhost:8000
```

Note: The default setup uses `setupProxy.js` to proxy `/api` requests to `localhost:8000`, so this file is optional.

## Development Workflow

1. **Start the backend** in one terminal:
   ```bash
   cd node
   npm start
   ```

2. **Start the frontend** in another terminal:
   ```bash
   cd frontend
   npm start
   ```

3. **Make changes** to either frontend or backend
   - Frontend changes will hot-reload automatically
   - Backend changes require restarting the server (or use `npm run watch`)

## Plaid Sandbox

In development, you'll use Plaid's sandbox environment:
- No real bank connections
- Use test credentials provided by Plaid Link
- See https://plaid.com/docs/sandbox/ for test credentials

## Troubleshooting

### Frontend can't connect to backend

- Make sure backend is running on port 8000
- Check that CORS is enabled in `node/index.js`
- Verify proxy settings in `frontend/src/setupProxy.js`

### Plaid Link not loading

- Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` are set
- Check that `PLAID_ENV=sandbox` in backend `.env`
- Look for errors in the browser console and backend logs

### Build failures

- Clear `node_modules` and reinstall:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```
