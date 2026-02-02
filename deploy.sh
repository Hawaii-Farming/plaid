#!/bin/bash
set -e

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP_PROJECT_ID not set"
  exit 1
fi

REGION="us-west1"
SERVICE_NAME="plaid-service"

echo "📦 Project: $PROJECT_ID"
echo ""

gcloud config set project $PROJECT_ID

echo "☁️  Building in the cloud with Cloud Build..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME:latest

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --update-env-vars PLAID_CLIENT_ID=${PLAID_CLIENT_ID:-placeholder},PLAID_SECRET=${PLAID_SECRET:-placeholder},PLAID_ENV=sandbox

echo ""
echo "✅ Deployment complete!"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")
echo "🌐 Your app is live at: $SERVICE_URL"
