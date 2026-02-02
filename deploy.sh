#!/bin/bash
set -e

echo "🏗️  Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "🐳 Building Docker image..."
docker build -t gcr.io/YOUR_PROJECT_ID/plaid-service:latest .

echo "📤 Pushing to Google Container Registry..."
docker push gcr.io/YOUR_PROJECT_ID/plaid-service:latest

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy plaid-service \
  --image gcr.io/YOUR_PROJECT_ID/plaid-service:latest \
  --region us-west1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars PLAID_CLIENT_ID=$PLAID_CLIENT_ID \
  --set-env-vars PLAID_SECRET=$PLAID_SECRET \
  --set-env-vars PLAID_ENV=production \
  --set-env-vars PLAID_REDIRECT_URI=https://plaid-service-982209115678.us-west1.run.app/oauth-callback \
  --set-env-vars DATABASE_URL=$DATABASE_URL

echo "✅ Deployment complete!"
echo "🌐 Visit: https://plaid-service-982209115678.us-west1.run.app"
