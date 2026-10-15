FROM node:24-bookworm-slim
WORKDIR /app
COPY commercial/backend/package.json commercial/backend/package.json
RUN npm install --prefix commercial/backend --omit=dev --ignore-scripts --package-lock=false
COPY commercial/backend/src commercial/backend/src
COPY commercial/engine/src commercial/engine/src
COPY commercial/engine/upstream/netlify/functions/cycle-lib.mts commercial/engine/upstream/netlify/functions/cycle-lib.mts
COPY commercial/engine/upstream/netlify/functions/trace-lib.mts commercial/engine/upstream/netlify/functions/trace-lib.mts
RUN mkdir -p /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8080 DATABASE_PATH=/data/hercules-commercial.sqlite NODE_ENV=production
EXPOSE 8080
CMD ["node", "commercial/backend/src/server.mjs"]

