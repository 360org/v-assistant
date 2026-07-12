# Agent Runner — Lightweight Docker image
FROM node:20-bookworm-slim

WORKDIR /app

# Copy package.json and install
COPY package.json ./
RUN npm install --no-audit --no-fund && npm install -g tsx

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create IPC & data directories
RUN mkdir -p /data/ipc /data/agents

# Environment defaults
ENV VUA_DATA_DIR=/data
ENV VUA_IPC_DIR=/data/ipc
ENV VUA_PROVIDER=openai
ENV VUA_ASSISTANT_NAME=V-Assistant
ENV VUA_AGENT_NAME=default

CMD ["tsx", "src/index.ts"]
