# Image for alt-history-shorts daily pipeline (Railway-ready)
# Includes Node 22, Chromium (for Remotion render), ffmpeg, fonts.

FROM node:22-bookworm-slim

# System deps: Chromium (Remotion needs a browser to render frames),
# ffmpeg (Remotion encodes via ffmpeg), and font packages (so Anton + emoji + Latin chars render).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=optional

# Copy the rest of the project
COPY . .

# Tell Remotion + Puppeteer where Chromium lives (skip the bundled-Chrome download)
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Render concurrency low for shared Railway compute (defaults to 6 on a fast Mac)
ENV REMOTION_CONCURRENCY=2

# Persistent state location (mount a Railway volume here for cross-run state)
ENV STATE_DIR=/data/state

# Output dir (ephemeral — written every run, can stay in container)
ENV OUTPUT_BASE=/app/output

# Cron entry: the daily orchestrator
CMD ["npm", "run", "daily"]
