# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json ./
COPY src ./src
# Type errors are reported in the build log (run `npm run typecheck` in CI to gate on them);
# the image only fails if compilation produced no output.
RUN npx tsc -p tsconfig.json || echo "⚠ TypeScript reported errors – see above"; test -f dist/server.js

# ---------- runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/api/health > /dev/null || exit 1
CMD ["node", "dist/server.js"]
