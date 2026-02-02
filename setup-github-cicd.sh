#!/bin/bash
set -e

PROJECT_ID="aloha-96743"

echo "🚀 Setting up GitHub CI/CD..."
echo ""

# Enable APIs
echo "📦 Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project Number: $PROJECT_NUMBER"
echo ""

# Grant permissions
echo "🔐 Granting Cloud Build permissions..."

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin" \
  --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.admin" \
  --condition=None

# Grant secret access
echo ""
echo "🔑 Granting access to secrets..."
for secret in plaid-access-token plaid-item-id plaid-api-key plaid-sheets-service-account; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID 2>/dev/null && echo "  ✓ $secret" || echo "  ⊘ $secret (doesn't exist or already has permission)"
done

echo ""
echo "✅ Permissions configured!"
echo ""
echo "📝 Next step: Connect GitHub repository"
echo ""
echo "Go to: https://console.cloud.google.com/cloud-build/triggers?project=$PROJECT_ID"
echo ""
