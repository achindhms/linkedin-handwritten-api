FROM node:20-bookworm-slim

# node-canvas (used to render the postcards) needs these native libraries.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Bake the handwriting fonts into the image so the container works offline at runtime.
RUN npm run setup-fonts || echo "Font download failed during build — retry with 'docker exec <container> npm run setup-fonts'"

EXPOSE 3000
CMD ["node", "server.js"]
