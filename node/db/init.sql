-- Plaid Token Storage Database Schema
-- This schema stores Plaid access tokens and related metadata for production use
-- Enables persistent token storage across server restarts and automated data extraction

-- Main table for storing Plaid access tokens and metadata
CREATE TABLE IF NOT EXISTS plaid_tokens (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    institution_name VARCHAR(255),
    accounts JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_plaid_tokens_user_id ON plaid_tokens(user_id);

-- Index on item_id for fast item-based operations
CREATE INDEX IF NOT EXISTS idx_plaid_tokens_item_id ON plaid_tokens(item_id);

-- Index on is_active and last_used_at for retrieving the most recent active token
CREATE INDEX IF NOT EXISTS idx_plaid_tokens_active_last_used ON plaid_tokens(is_active, last_used_at DESC);

-- Comments documenting the schema
COMMENT ON TABLE plaid_tokens IS 'Stores Plaid access tokens and metadata for persistent storage across server restarts';
COMMENT ON COLUMN plaid_tokens.user_id IS 'Unique identifier for the user (e.g., demo-user-id)';
COMMENT ON COLUMN plaid_tokens.access_token IS 'Plaid access token for API calls';
COMMENT ON COLUMN plaid_tokens.item_id IS 'Plaid item ID associated with this token';
COMMENT ON COLUMN plaid_tokens.institution_name IS 'Name of the financial institution';
COMMENT ON COLUMN plaid_tokens.accounts IS 'JSON array of account objects';
COMMENT ON COLUMN plaid_tokens.created_at IS 'Timestamp when the token was first created';
COMMENT ON COLUMN plaid_tokens.last_used_at IS 'Timestamp when the token was last used for API calls';
COMMENT ON COLUMN plaid_tokens.is_active IS 'Whether the token is currently active and valid';
