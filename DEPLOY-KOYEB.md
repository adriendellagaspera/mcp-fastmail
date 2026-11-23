# Deploy overlay (Render)

This branch (`deploy-koyeb`) adds container deployment on top of the fork,
so the MCP server built from this repo's own source is reachable over
Streamable HTTP: `https://<service>.onrender.com/mcp`.

## Layers

1. `dist/index.js` — the MCP server (stdio), built from the source in this repo.
2. `supergateway` — one instance per Fastmail account, on loopback ports
   8807 (main account) and 8808 (second account, only started if
   `FASTMAIL_API_TOKEN_WIFE` is set). Each gateway injects its own JMAP
   token into its child processes.
3. `auth-proxy.mjs` — the only public port. Requires `Authorization:
   Bearer <token>` (or `x-mcp-token`). The presented token selects the
   gateway: `PROXY_TOKEN` -> 8807, `PROXY_TOKEN_WIFE` -> 8808.
4. `babysitter.mjs` — probes each gateway with an MCP initialize every
   30 s, deletes the probe session (stateful mode), and `pkill`s wedged
   gateways so the watchdogs in `start.sh` restart them.

## Gateway mode (RAM and wedge history)

Default is supergateway's **stateless** mode: every MCP request spawns a
fresh child process (`node dist/index.js`, ~60-90 MB). On the 512 MB free
instance this is what wedged the gateway after ~20 sequential requests or a
handful of parallel ones. Set `STATEFUL=1` to switch both gateways to
`--stateful`: one child per MCP session (sessions idle out after 30 min),
far fewer spawns.

Caveat: stateful mode requires clients to send their `Mcp-Session-Id`
header on every request (the Streamable HTTP standard behavior). If a
client behaves fully statelessly, requests fail with 400; unset
`STATEFUL` to fall back.

## Required environment variables (Render secrets)

| Variable | Value |
|---|---|
| `FASTMAIL_API_TOKEN` | Main account's Fastmail JMAP API token (Settings > Privacy & Security > Integrations). Scopes: Email + Email submission |
| `PROXY_TOKEN` | Long random secret for the main account, sent by MCP clients as Bearer. Generate with `openssl rand -hex 32` |

## Optional

| Variable | Effect |
|---|---|
| `FASTMAIL_API_TOKEN_WIFE` | Second account's JMAP token. Enables gateway B on 8808 |
| `PROXY_TOKEN_WIFE` | Second account's client secret. Both secrets must be set to activate the route |
| `STATEFUL=1` | One child per session instead of one per request (recommended once validated with the client) |
| `FASTMAIL_BULK_CONFIRM_THRESHOLD` | Lower the bulk-confirm gate (default 100) |
| `FASTMAIL_READ_ONLY=1` | Refuse all write tools. Start here, remove later |
| `FASTMAIL_AUDIT_LOG` | Path to a JSONL audit log of bulk operations |

## Deploy

1. Render dashboard: Web Service, runtime Node (not Docker), branch
   `deploy-koyeb`, build `npm install --no-save supergateway http-proxy
   && npm run build`, start `sh start.sh`.
2. Add the environment variables above as secrets.
3. Once deployed, the MCP endpoint is `https://<service>.onrender.com/mcp`,
   authenticated by Bearer token; the health check is `/health`.

## Local smoke test

```bash
docker build -t fastmail-mcp .
docker run -p 8000:8000 \
  -e FASTMAIL_API_TOKEN=... -e PROXY_TOKEN=... fastmail-mcp

# unauthorized: 401
curl -i http://localhost:8000/mcp
# token accepted, routes to gateway A
curl -i -H 'Authorization: Bearer ...' http://localhost:8000/mcp
```

## Notes

- Free-tier services sleep after 15 min idle; first request pays a ~1 min
  cold start. Ping `/health` to wake.
- With two accounts configured, plan for ~80 MB extra for the second idle
  gateway; spike usage on both accounts at once is the tight case on the
  free plan.
- CalDav/WebDAV credentials (calendar/files) follow the upstream README
  (`FASTMAIL_CALDAV_USERNAME`, `FASTMAIL_CALDAV_PASSWORD`, ...).
- Do not merge this branch into `main`; it is a deploy overlay. Rebase it
  after syncing the fork with upstream.
