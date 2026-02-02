# Production Database Setup Guide

This guide covers setting up PostgreSQL database for persistent token storage in production environments, particularly with Google Cloud Platform (GCP) Cloud SQL.

## Table of Contents

- [Overview](#overview)
- [Local Development Setup](#local-development-setup)
- [GCP Cloud SQL PostgreSQL Setup](#gcp-cloud-sql-postgresql-setup)
- [Database Configuration](#database-configuration)
- [Security Best Practices](#security-best-practices)
- [Migration from In-Memory to Database Storage](#migration-from-in-memory-to-database-storage)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Overview

The Plaid backend now supports persistent token storage using PostgreSQL. This enables:
- Tokens persist across server restarts
- Multiple tokens can be stored and managed
- Automated data extraction without re-authentication
- Production-ready token lifecycle management

## Local Development Setup

### Using Docker Compose (Recommended)

1. **Start PostgreSQL and the application:**
   ```bash
   docker-compose up postgres node
   ```

2. **The database will be automatically initialized** with the schema from `node/db/init.sql`

3. **Access the database directly:**
   ```bash
   docker exec -it plaid-postgres-1 psql -U plaid_user -d plaid_production
   ```

### Manual PostgreSQL Setup

1. **Install PostgreSQL:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   
   # macOS
   brew install postgresql
   ```

2. **Create database and user:**
   ```bash
   sudo -u postgres psql
   ```
   
   ```sql
   CREATE DATABASE plaid_production;
   CREATE USER plaid_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE plaid_production TO plaid_user;
   \q
   ```

3. **Initialize the schema:**
   ```bash
   psql -U plaid_user -d plaid_production -f node/db/init.sql
   ```

4. **Configure environment variables** in `node/.env`:
   ```bash
   # Individual components
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=plaid_production
   DB_USER=plaid_user
   DB_PASSWORD=your_secure_password
   DB_SSL=false
   
   # Or use connection string
   # DATABASE_URL=postgresql://plaid_user:your_secure_password@localhost:5432/plaid_production
   ```

## GCP Cloud SQL PostgreSQL Setup

### Step 1: Create Cloud SQL Instance

1. **Go to Cloud SQL in GCP Console:**
   ```
   https://console.cloud.google.com/sql/instances
   ```

2. **Click "CREATE INSTANCE" and select PostgreSQL**

3. **Configure your instance:**
   - **Instance ID:** `plaid-production-db`
   - **Password:** Generate a strong password
   - **Database version:** PostgreSQL 15
   - **Region:** Choose closest to your application
   - **Machine type:** Shared core for development, dedicated for production
   - **Storage:** Start with 10 GB (auto-increase enabled)
   - **Backups:** Enable automated backups
   - **High availability:** Enable for production

4. **Configure connections:**
   - **Public IP:** Enable if connecting from external services
   - **Private IP:** Recommended for production (requires VPC setup)
   - **Authorized networks:** Add your IP addresses (for public IP)
   - **SSL:** Require SSL connections (recommended)

### Step 2: Create Database and User

1. **Connect to your Cloud SQL instance:**
   ```bash
   gcloud sql connect plaid-production-db --user=postgres
   ```

2. **Create database and user:**
   ```sql
   CREATE DATABASE plaid_production;
   CREATE USER plaid_user WITH PASSWORD 'generate_strong_password_here';
   GRANT ALL PRIVILEGES ON DATABASE plaid_production TO plaid_user;
   \c plaid_production
   GRANT ALL ON SCHEMA public TO plaid_user;
   \q
   ```

3. **Initialize the schema:**
   ```bash
   # Upload init.sql to Cloud Storage or local machine
   gcloud sql connect plaid-production-db --user=plaid_user --database=plaid_production < node/db/init.sql
   ```

### Step 3: Configure Application Connection

#### Option A: Using Cloud SQL Proxy (Recommended for Cloud Run/Compute Engine)

1. **Enable Cloud SQL Admin API**

2. **Get connection name:**
   ```bash
   gcloud sql instances describe plaid-production-db --format="value(connectionName)"
   # Output: project-id:region:instance-id
   ```

3. **Set environment variable:**
   ```bash
   DATABASE_URL=postgresql://plaid_user:password@/plaid_production?host=/cloudsql/PROJECT:REGION:INSTANCE
   ```

#### Option B: Direct Connection (Public IP)

1. **Get instance IP:**
   ```bash
   gcloud sql instances describe plaid-production-db --format="value(ipAddresses[0].ipAddress)"
   ```

2. **Download SSL certificates:**
   ```bash
   gcloud sql ssl-certs create client-cert client-key --instance=plaid-production-db
   gcloud sql ssl-certs describe client-cert --instance=plaid-production-db --format="get(cert)" > server-ca.pem
   ```

3. **Set environment variables:**
   ```bash
   DATABASE_URL=postgresql://plaid_user:password@INSTANCE_IP:5432/plaid_production?sslmode=require
   DB_SSL=true
   ```

### Step 4: Test Connection

```bash
# From your application server
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  console.log(err ? err : res.rows[0]);
  pool.end();
});
"
```

## Database Configuration

### Connection String Format

```
postgresql://[user]:[password]@[host]:[port]/[database]?[options]
```

**Examples:**

```bash
# Local development
DATABASE_URL=postgresql://plaid_user:password@localhost:5432/plaid_production

# Cloud SQL with public IP and SSL
DATABASE_URL=postgresql://plaid_user:password@35.x.x.x:5432/plaid_production?sslmode=require

# Cloud SQL with Unix socket (Cloud Run/Compute Engine)
DATABASE_URL=postgresql://plaid_user:password@/plaid_production?host=/cloudsql/project:region:instance

# Cloud SQL with pgbouncer
DATABASE_URL=postgresql://plaid_user:password@pgbouncer-ip:6432/plaid_production
```

### Individual Components

Alternatively, use separate environment variables:

```bash
DB_HOST=localhost              # or Cloud SQL IP
DB_PORT=5432
DB_NAME=plaid_production
DB_USER=plaid_user
DB_PASSWORD=your_password
DB_SSL=true                    # Set to 'true' for production
```

## Security Best Practices

### 1. Connection Security

- **Always use SSL in production:** Set `DB_SSL=true`
- **Use Cloud SQL Proxy** when possible for automatic encryption
- **Rotate passwords regularly** (every 90 days recommended)
- **Use IAM authentication** for GCP services when available

### 2. Access Control

- **Limit authorized networks** to only necessary IPs
- **Use private IP** for internal GCP services
- **Enable Cloud SQL audit logging**
- **Use least privilege principle** for database users

### 3. Token Security

- **Never commit tokens to version control**
- **Consider token encryption at rest** (future enhancement)
- **Implement token rotation** for expired tokens
- **Monitor token usage** via `last_used_at` timestamps
- **Use API keys** to protect token retrieval endpoints

### 4. Environment Variables

```bash
# NEVER commit these values to git
# Use secrets management services:

# GCP Secret Manager
DATABASE_URL=$(gcloud secrets versions access latest --secret="plaid-database-url")
API_KEY=$(gcloud secrets versions access latest --secret="plaid-api-key")
PLAID_SECRET=$(gcloud secrets versions access latest --secret="plaid-secret")

# Or AWS Secrets Manager, Azure Key Vault, etc.
```

### 5. Connection Limits

Configure connection pooling to avoid exhausting database connections:

```javascript
// In db/database.js (already configured)
max: 20,                      // Maximum pool size
idleTimeoutMillis: 30000,     // Close idle clients after 30s
connectionTimeoutMillis: 2000 // Timeout if connection takes > 2s
```

For Cloud SQL, set connection limits:

```bash
gcloud sql instances patch plaid-production-db \
  --database-flags max_connections=100
```

## Migration from In-Memory to Database Storage

### Step 1: Prepare

1. **Backup existing tokens** (if any stored elsewhere)
2. **Set up database** as described above
3. **Test database connection**

### Step 2: Enable Database

1. **Update `.env` file:**
   ```bash
   DATABASE_URL=postgresql://plaid_user:password@host:5432/plaid_production
   API_KEY=generate_secure_random_key
   ```

2. **Restart the application:**
   ```bash
   cd node
   npm start
   ```

3. **Verify database connection:**
   ```bash
   curl http://localhost:8000/api/health/db
   ```

### Step 3: Migrate Existing Tokens

If you have existing tokens in memory, they will be automatically saved to the database the next time you use the Link flow:

1. **Open the application UI**
2. **Complete the Link flow** (or re-authenticate)
3. **Verify token is saved:**
   ```bash
   # Requires API key
   curl -H "X-API-Key: your_api_key" http://localhost:8000/api/tokens
   ```

### Step 4: Verify

1. **Test server restart:**
   - Stop the application
   - Start the application
   - Verify token is loaded: Check logs for "Loaded token for item..."

2. **Test token retrieval:**
   ```bash
   curl -H "X-API-Key: your_api_key" http://localhost:8000/api/tokens/active
   ```

## Backup and Recovery

### Automated Backups (Cloud SQL)

1. **Enable automated backups:**
   ```bash
   gcloud sql instances patch plaid-production-db \
     --backup-start-time=02:00 \
     --enable-bin-log \
     --retained-backups-count=7
   ```

2. **Create on-demand backup:**
   ```bash
   gcloud sql backups create --instance=plaid-production-db
   ```

3. **List backups:**
   ```bash
   gcloud sql backups list --instance=plaid-production-db
   ```

### Manual Backups

```bash
# Export database
pg_dump -U plaid_user -h localhost plaid_production > backup.sql

# Or for Cloud SQL
gcloud sql export sql plaid-production-db gs://your-bucket/backup.sql \
  --database=plaid_production
```

### Restore from Backup

```bash
# Local restore
psql -U plaid_user -h localhost plaid_production < backup.sql

# Cloud SQL restore
gcloud sql import sql plaid-production-db gs://your-bucket/backup.sql \
  --database=plaid_production
```

### Point-in-Time Recovery (Cloud SQL)

```bash
# Restore to a specific timestamp
gcloud sql backups restore BACKUP_ID \
  --backup-instance=plaid-production-db \
  --restore-instance=plaid-production-db-restored
```

## Troubleshooting

### Connection Refused

**Problem:** Cannot connect to database

**Solutions:**
1. Check database is running: `docker ps` or `gcloud sql instances list`
2. Verify connection string format
3. Check firewall rules (GCP authorized networks)
4. Verify SSL settings match configuration

### Authentication Failed

**Problem:** Password authentication failed

**Solutions:**
1. Verify username and password in `.env`
2. Check user exists: `psql -c "\du"`
3. Reset password if needed:
   ```sql
   ALTER USER plaid_user WITH PASSWORD 'new_password';
   ```

### SSL Connection Error

**Problem:** SSL required but not configured

**Solutions:**
1. Set `DB_SSL=true` in environment
2. Download SSL certificates for Cloud SQL
3. Use Cloud SQL Proxy (handles SSL automatically)

### Too Many Connections

**Problem:** Connection pool exhausted

**Solutions:**
1. Increase `max_connections` on database
2. Reduce connection pool size in application
3. Check for connection leaks (always close connections)

### Token Not Found After Restart

**Problem:** Database enabled but token not loaded

**Solutions:**
1. Check database contains tokens: `SELECT * FROM plaid_tokens;`
2. Verify `is_active = true` for the token
3. Check application logs for database connection errors
4. Ensure database was initialized with schema

### Performance Issues

**Problem:** Slow database queries

**Solutions:**
1. Check indexes are created: `\di` in psql
2. Analyze query performance: `EXPLAIN ANALYZE SELECT ...`
3. Upgrade Cloud SQL machine type
4. Enable Cloud SQL insights for monitoring
5. Consider connection pooling with pgBouncer

## Monitoring

### Cloud SQL Monitoring

1. **View metrics in GCP Console:**
   - CPU utilization
   - Memory usage
   - Connection count
   - Query performance

2. **Set up alerts:**
   ```bash
   gcloud alpha monitoring policies create \
     --notification-channels=CHANNEL_ID \
     --display-name="High DB Connections" \
     --condition-display-name="Connection count > 80" \
     --condition-threshold-value=80
   ```

### Application Monitoring

```bash
# Check database health
curl http://localhost:8000/api/health/db

# Check token count
curl -H "X-API-Key: your_api_key" http://localhost:8000/api/tokens | jq '.count'

# Check token usage
psql -U plaid_user -d plaid_production -c \
  "SELECT user_id, institution_name, last_used_at FROM plaid_tokens WHERE is_active = true;"
```

## Support

For issues specific to:
- **Plaid API:** [Plaid Support](https://dashboard.plaid.com/support)
- **Cloud SQL:** [GCP Support](https://cloud.google.com/support)
- **This application:** Check logs and health endpoints

## Next Steps

- Review [GCP_JOB_SETUP.md](GCP_JOB_SETUP.md) for automated data extraction
- Implement token encryption at rest (recommended for production)
- Set up monitoring and alerting
- Configure automated backups
- Review security audit logs regularly
