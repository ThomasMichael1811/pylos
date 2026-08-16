# ── Build-Stage: Dependencies + Builds ──────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx esbuild src/server/server.ts --bundle --platform=node --format=cjs --outfile=server.cjs

# ── Runtime: nur Bundle + statische Dateien ─────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    STATIC_DIR=/app/dist
COPY --from=build /app/server.cjs ./
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node", "server.cjs"]
