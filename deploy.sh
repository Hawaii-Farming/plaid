#!/bin/bash
set -e

# Get project ID from gcloud config or use environment variable
PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP_PROJECT_ID environment variable not set and no gcloud project configured"
  echo "Set it with: export GCP_PROJECT_ID=your-project-id"
  echo "Or configure gcloud: gcloud config set project your-project-id"
  exit 1
fi

echo "📦 Using project: $PROJECT_ID"

echo "🏗️  Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "🐳 Building Docker image..."
docker build -t gcr.io/$PROJECT_ID/plaid-service:latest .

echo "📤 Pushing to Google Container Registry..."
docker push gcr.io/$PROJECT_ID/plaid-service:latest

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy plaid-service \
  --image gcr.io/$PROJECT_ID/plaid-service:latest \
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
