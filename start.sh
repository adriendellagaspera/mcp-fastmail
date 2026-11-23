#!/bin/sh
set -e

# 1. supergateway wraps the stdio MCP server as Streamable HTTP on 127.0.0.1:8807.
#    Shell watchdog: restart the gateway whenever it exits.
(
  while true; do
    npx supergateway \
      --stdio "node dist/index.js" \
      --outputTransport streamableHttp \
      --port 8807 \
      --host 127.0.0.1 || echo "[watchdog] gateway exited"
    echo "[watchdog] restarting gateway in 2s"
    sleep 2
  done
) &

# 2. Babysitter: kills the gateway when alive-but-wedged (watchdog then restarts it)
node babysitter.mjs &

# 3. Authenticated front proxy on $PORT (Render injects PORT, default 8000)
exec node auth-proxy.mjs
