FROM node:22-bookworm-slim

ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=$NPM_CONFIG_REGISTRY
ENV CLAUDE_CONFIG_DIR=/app/claude-config
ENV CLAUDE_WORKER_PROMPT_DIR=/app/prompts
ENV PATH="/opt/worker-venv/bin:$PATH"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-liberation \
    python3 \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm install -g @anthropic-ai/claude-code

COPY requirements.txt ./
RUN python3 -m venv /opt/worker-venv \
  && pip install --no-cache-dir -r requirements.txt

COPY server.js ./
COPY src ./src
COPY scripts ./scripts
COPY claude-config ./claude-config
COPY prompts ./prompts

EXPOSE 8001

CMD ["node", "server.js"]
