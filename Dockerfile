FROM node:18-alpine AS builder

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Setup backend
FROM node:18-alpine
WORKDIR /app

# Copy backend
COPY node/package*.json ./
RUN npm ci --only=production

COPY node/ ./

# Copy frontend build
COPY --from=builder /app/frontend/build ./frontend/build

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "index.js"]
