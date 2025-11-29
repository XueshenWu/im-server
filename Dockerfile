# ---------------------------------------
# STAGE 1: The Builder (The Factory)
# ---------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first to cache dependencies
COPY package*.json ./

# Install ALL dependencies (including TypeScript, @types, etc.)
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code (creates the /dist folder)
RUN npm run build

# ---------------------------------------
# STAGE 2: The Runner (Production)
# ---------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Set to production (optimizes performance)
ENV NODE_ENV=production

# Copy package files again
COPY package*.json ./

# Install ONLY production dependencies (skips TypeScript, Eslint, etc.)
# 'npm ci' is faster and more reliable than 'npm install' for CI/CD
RUN npm ci --omit=dev && npm cache clean --force

# COPY THE ARTIFACT:
# We reach back into the 'builder' stage and grab the 'dist' folder
COPY --from=builder /app/dist ./dist

# Expose the port
EXPOSE 3000

# Start the app using the compiled JS
CMD ["node", "dist/index.js"]