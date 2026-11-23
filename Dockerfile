# Deployment image for mcp-fastmail on Koyeb (or any container host)
# Build the MCP server from this fork's source, then wrap it:
#   - supergateway: exposes the stdio server as Streamable HTTP on 127.0.0.1:8807
#   - auth-proxy: requires an x-mcp-token header before any request reaches the gateway

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm install --no-save supergateway http-proxy \
    && rm -rf /root/.npm
COPY --from=build /app/dist ./dist
COPY auth-proxy.mjs start.sh ./

EXPOSE 8000
ENTRYPOINT ["sh", "start.sh"]
