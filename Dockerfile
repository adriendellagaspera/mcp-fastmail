# Deployment image for mcp-fastmail (Render or any container host)
# Build the MCP server from this fork's source, then wrap it:
#   - gateways.mjs: one supergateway per Fastmail account (accounts.mjs config)
#   - auth-proxy.mjs: requires a Bearer/x-mcp-token before any request reaches
#     a gateway, and routes each token to its account's gateway

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
COPY auth-proxy.mjs accounts.mjs gateways.mjs babysitter.mjs start.sh ./

EXPOSE 8000
ENTRYPOINT ["sh", "start.sh"]
