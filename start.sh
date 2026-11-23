#!/bin/sh
set -e

# 1. supergateway wraps the stdio MCP server as Streamable HTTP on 127.0.0.1:8807
npx supergateway \
  --stdio "node dist/index.js" \
  --outputTransport streamableHttp \
  --port 8807 \
  --stateless &

# 2. Authenticated front proxy on $PORT (Render injects PORT, default 8000)
exec node auth-proxy.mjs
