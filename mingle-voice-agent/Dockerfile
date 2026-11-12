FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# rtc-node ships its native WebRTC binary as an optional platform package,
# so install scripts are not needed.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY tsconfig.json *.ts ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "./node_modules/ts-node/dist/bin.js", "--transpile-only", "service.ts"]
