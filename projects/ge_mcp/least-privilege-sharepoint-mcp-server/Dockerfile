# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy source code
COPY index.js ./

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy from builder with non-root ownership
COPY --from=builder --chown=node:node /app ./

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Run as non-root user (principle of least privilege)
USER node

# Expose the port (Cloud Run uses PORT env var)
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
