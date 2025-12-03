### Multi-stage Dockerfile for admin-service (NestJS)
FROM node:18-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies based on lockfile
COPY package.json pnpm-lock.yaml ./
# Use frozen lockfile to ensure reproducible installs
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . ./
RUN pnpm run build

FROM node:18-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Create non-root user (use built-in node user)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built app and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]
