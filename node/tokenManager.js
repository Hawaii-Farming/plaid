'use strict';

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'aloha-96743';
const secretClient = new SecretManagerServiceClient();

// Cache tokens in memory for performance (reloaded on restart)
let cachedAccessToken = null;
let cachedItemId = null;

async function getSecret(secretName) {
  try {
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload.data.toString();
    
    // Return null if it's the placeholder value
    if (payload === 'placeholder' || !payload) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error(`Error getting secret ${secretName}:`, error.message);
    return null;
  }
}

async function setSecret(secretName, value) {
  try {
    const parent = `projects/${PROJECT_ID}/secrets/${secretName}`;
    
    // Add a new version
    await secretClient.addSecretVersion({
      parent: parent,
      payload: {
        data: Buffer.from(value, 'utf8'),
      },
    });
    
    console.log(`✅ Updated secret: ${secretName}`);
    return true;
  } catch (error) {
    console.error(`Error setting secret ${secretName}:`, error.message);
    return false;
  }
}

async function getAccessToken() {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  
  console.log('📥 Loading access token from Secret Manager...');
  cachedAccessToken = await getSecret('plaid-access-token');
  
  if (cachedAccessToken) {
    console.log('✅ Access token loaded from Secret Manager');
  } else {
    console.log('⚠️  No access token found - please connect a bank account');
  }
  
  return cachedAccessToken;
}

async function setAccessToken(token) {
  cachedAccessToken = token;
  return await setSecret('plaid-access-token', token);
}

async function getItemId() {
  if (cachedItemId) {
    return cachedItemId;
  }
  
  cachedItemId = await getSecret('plaid-item-id');
  return cachedItemId;
}

async function setItemId(itemId) {
  cachedItemId = itemId;
  return await setSecret('plaid-item-id', itemId);
}

async function clearTokens() {
  cachedAccessToken = null;
  cachedItemId = null;
  await setSecret('plaid-access-token', 'placeholder');
  await setSecret('plaid-item-id', 'placeholder');
  console.log('🗑️  Tokens cleared');
}

module.exports = {
  getAccessToken,
  setAccessToken,
  getItemId,
  setItemId,
  clearTokens,
};
