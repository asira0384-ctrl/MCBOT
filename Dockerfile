FROM public.ecr.aws/docker/library/node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && npm ci --omit=dev --ignore-scripts && node scripts/prepare-raknet.js
COPY src ./src
COPY vendor ./vendor
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]
