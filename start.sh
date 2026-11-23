#!/bin/sh
set -e

# One gateway per Fastmail account, each with its own JMAP token in its
# children's environment. The auth proxy routes each client token to the
# gateway that owns the matching account:
#   gateway A (8807): Adrien   — FASTMAIL_API_TOKEN (or FASTMAIL_API_TOKEN_ADRIEN)
#   gateway B (8808): wife     — FASTMAIL_API_TOKEN_WIFE (gateway only started if set)

# STATEFUL=1 switches supergateway to --stateful: one child process per MCP
# session instead of one per request (stateless default). Drastically fewer
# spawns, but requires clients to carry their Mcp-Session-Id header.
STATEFUL_ARGS=""
if [ "${STATEFUL:-0}" = "1" ]; then
  STATEFUL_ARGS="--stateful"
  echo "[start] gateway mode: stateful (one child per session)"
else
  echo "[start] gateway mode: stateless (one child per request)"
fi

run_gateway() {
  label="$1"
  gw_port="$2"
  jmap_token="$3"
  (
    while true; do
      FASTMAIL_API_TOKEN="$jmap_token" npx supergateway \
        --stdio "node dist/index.js" \
        --outputTransport streamableHttp \
        --port "$gw_port" \
        --host 127.0.0.1 \
        $STATEFUL_ARGS || echo "[watchdog-$label] gateway exited"
      echo "[watchdog-$label] restarting gateway in 2s"
      sleep 2
    done
  ) &
}

run_gateway adrien 8807 "${FASTMAIL_API_TOKEN:-$FASTMAIL_API_TOKEN_ADRIEN}"
if [ -n "${FASTMAIL_API_TOKEN_WIFE:-}" ]; then
  run_gateway wife 8808 "$FASTMAIL_API_TOKEN_WIFE"
fi

# Babysitter: kills gateways that are alive but wedged; watchdogs restart them.
node babysitter.mjs &

# Authenticated front proxy on $PORT (Render injects PORT, default 8000)
exec node auth-proxy.mjs
