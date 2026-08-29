# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production for smaller image)
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose backend port
EXPOSE 5000

# Set environment variables (fallbacks)
ENV NODE_ENV=production
ENV PORT=5000
ENV BACKEND_URL=http://localhost:5000

# Start the application
CMD ["node", "src/server.js"]
