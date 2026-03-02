FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY src ./src

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
