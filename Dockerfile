FROM node:18-alpine AS builder

WORKDIR /app/node/frontend
COPY node/frontend/package*.json ./
RUN npm install
COPY node/frontend/ ./
RUN npm run build

FROM node:18-alpine
WORKDIR /app

COPY node/package*.json ./
RUN npm install --only=production

COPY node/*.js ./
COPY node/.env* ./
COPY node/.npmrc ./
COPY node/.nvmrc ./
COPY node/.prettierrc ./
COPY node/start.sh ./

COPY --from=builder /app/node/frontend/build ./frontend/build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "index.js"]
