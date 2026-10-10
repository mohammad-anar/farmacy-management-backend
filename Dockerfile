# ---------------------------------------------------------------------
# Multi-Stage Production Dockerfile for Pharmacy Management Backend
# ---------------------------------------------------------------------

# Stage 1: Build & Compile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma client and compile TypeScript
COPY . .
RUN npm run prisma:generate
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production
RUN npx prisma generate

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 5000

CMD ["node", "dist/main"]
