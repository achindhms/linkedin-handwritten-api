FROM node:20-bookworm-slim

# node-canvas (used to render the postcards) needs these native libraries.
# fontconfig specifically is what lets Pango (which node-canvas uses for text
# layout on Linux) actually find and use our custom handwriting fonts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fontconfig \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Bake the handwriting fonts into the image so the container works offline at runtime.
RUN npm run setup-fonts || echo "Font download failed during build — retry with 'docker exec <container> npm run setup-fonts'"

# Register the fonts with fontconfig so Pango can actually find them by name —
# registerFont() alone isn't enough on this stack.
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && cp fonts/*.ttf /usr/share/fonts/truetype/custom/ 2>/dev/null || true \
    && fc-cache -f -v

EXPOSE 3000
CMD ["node", "server.js"]
