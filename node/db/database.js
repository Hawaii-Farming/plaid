'use strict';

/**
 * Database helper module for PostgreSQL integration
 * Provides connection pooling and token management functions
 */

const { Pool } = require('pg');

// Validate port number
function validatePort(portStr) {
  const port = parseInt(portStr || '5432', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid DB_PORT: ${portStr}. Using default port 5432.`);
    return 5432;
  }
  return port;
}

// Database configuration from environment variables
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: validatePort(process.env.DB_PORT),
  database: process.env.DB_NAME || 'plaid_production',
  user: process.env.DB_USER || 'plaid_user',
  password: process.env.DB_PASSWORD || 'plaid_password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Use connectionString if provided, otherwise use individual components
const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: dbConfig.connectionString, ssl: dbConfig.ssl }
  : {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
      max: dbConfig.max,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    };

let pool = null;

/**
 * Initialize the database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function initializePool() {
  if (!pool) {
    pool = new Pool(poolConfig);
    
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    console.log('Database connection pool initialized');
  }
  return pool;
}

/**
 * Get the database connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection is successful
 */
async function testConnection() {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

/**
 * Save a new token or update an existing one
 * @param {string} userId - User identifier
 * @param {string} accessToken - Plaid access token
 * @param {string} itemId - Plaid item ID
 * @param {string} institutionName - Institution name
 * @param {Array} accounts - Array of account objects
 * @returns {Promise<Object>} Saved token record
 */
async function saveToken(userId, accessToken, itemId, institutionName, accounts) {
  const pool = getPool();
  const query = `
    INSERT INTO plaid_tokens (user_id, access_token, item_id, institution_name, accounts, last_used_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      item_id = EXCLUDED.item_id,
      institution_name = EXCLUDED.institution_name,
      accounts = EXCLUDED.accounts,
      last_used_at = NOW(),
      is_active = true
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [
      userId,
      accessToken,
      itemId,
      institutionName || null,
      accounts ? JSON.stringify(accounts) : null,
    ]);
    console.log(`Token saved for user ${userId}, item ${itemId}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error saving token:', error.message);
    throw error;
  }
}

/**
 * Get active token for a specific user
 * @param {string} userId - User identifier
 * @returns {Promise<Object|null>} Token record or null
 */
async function getActiveToken(userId) {
  const pool = getPool();
  const query = `
    SELECT * FROM plaid_tokens
    WHERE user_id = $1 AND is_active = true
    LIMIT 1;
  `;
  
  try {
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting active token:', error.message);
    throw error;
  }
}

/**
 * Get all active tokens
 * @returns {Promise<Array>} Array of active token records
 */
async function getAllActiveTokens() {
  const pool = getPool();
  const query = `
    SELECT * FROM plaid_tokens
    WHERE is_active = true
    ORDER BY last_used_at DESC;
  `;
  
  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error getting all active tokens:', error.message);
    throw error;
  }
}

/**
 * Get the most recently used active token
 * @returns {Promise<Object|null>} Token record or null
 */
async function getMostRecentActiveToken() {
  const pool = getPool();
  const query = `
    SELECT * FROM plaid_tokens
    WHERE is_active = true
    ORDER BY last_used_at DESC
    LIMIT 1;
  `;
  
  try {
    const result = await pool.query(query);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting most recent active token:', error.message);
    throw error;
  }
}

/**
 * Update the last_used_at timestamp for a token
 * @param {string} accessToken - Plaid access token
 * @returns {Promise<Object|null>} Updated token record
 */
async function updateLastUsed(accessToken) {
  const pool = getPool();
  const query = `
    UPDATE plaid_tokens
    SET last_used_at = NOW()
    WHERE access_token = $1 AND is_active = true
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [accessToken]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating last_used_at:', error.message);
    throw error;
  }
}

/**
 * Deactivate a token by item ID
 * @param {string} itemId - Plaid item ID
 * @returns {Promise<Object|null>} Deactivated token record
 */
async function deactivateToken(itemId) {
  const pool = getPool();
  const query = `
    UPDATE plaid_tokens
    SET is_active = false
    WHERE item_id = $1
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [itemId]);
    if (result.rows[0]) {
      console.log(`Token deactivated for item ${itemId}`);
    }
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deactivating token:', error.message);
    throw error;
  }
}

/**
 * Close the database connection pool gracefully
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}

module.exports = {
  initializePool,
  getPool,
  testConnection,
  saveToken,
  getActiveToken,
  getAllActiveTokens,
  getMostRecentActiveToken,
  updateLastUsed,
  deactivateToken,
  closePool,
};
