# Dockerfile
# Build image for Zeca application
FROM node:23-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the server in development mode (watch for changes)
CMD ["npm", "run", "dev"]
