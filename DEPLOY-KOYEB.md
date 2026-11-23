# Deploy overlay (Render)

This branch (`deploy-koyeb`) adds container deployment on top of the fork,
so the MCP server built from this repo's own source is reachable over
Streamable HTTP: `https://<service>.onrender.com/mcp`.

## Layers

1. `dist/index.js` — the MCP server (stdio), built from the source in this repo.
2. `gateways.mjs` — one supergateway per account, on loopback ports 8807,
   8808, ... Each gateway injects its account's JMAP token into its child
   processes and is restarted forever, 2 s apart, by the supervisor.
3. `auth-proxy.mjs` — the only public port. Requires `Authorization:
   Bearer <token>` (or `x-mcp-token`). The presented token selects the
   account and its gateway (timing-safe comparison).
4. `babysitter.mjs` — probes each gateway with an MCP initialize every
   30 s, deletes the probe session (stateful mode), and `pkill`s wedged
   gateways so the supervisor restarts them.

## Accounts (generic multi-account config)

All accounts live in ONE secret, `FASTMAIL_ACCOUNTS`:

```json
[
  { "label": "adrien", "proxyToken": "<hex>", "apiToken": "<jmap>" },
  { "label": "spouse", "proxyToken": "<hex>", "apiToken": "<jmap>" }
]
```

- `label`: for logs and `/health` only.
- `proxyToken`: what that person's LLM sends (Bearer). One per account,
  `openssl rand -hex 32`. Values are secrets; never commit them.
- `apiToken`: that account's Fastmail JMAP token (Settings > Privacy
  & Security > Integrations).

Shorthand `{"<proxyToken>": "<apiToken>"}` is accepted (labels become
account-1, ...). Each MCP client uses the same URL `/mcp` with its own
proxy token; accounts never see each other's mail.

If `FASTMAIL_ACCOUNTS` is unset, the single-account secrets are used:
`PROXY_TOKEN` (+ `PROXY_TOKEN_ADRIEN`) and `FASTMAIL_API_TOKEN`
(+ `FASTMAIL_API_TOKEN_ADRIEN`).

## Gateway mode (RAM and wedge history)

Default is supergateway's **stateless** mode: every MCP request spawns a
fresh child process (`node dist/index.js`, ~60-90 MB). On the 512 MB free
instance this is what wedged the gateway after ~20 sequential requests or a
handful of parallel ones. Set `STATEFUL=1` to switch all gateways to
`--stateful`: one child per MCP session (sessions idle out after 30 min),
far fewer spawns.

Caveat: stateful mode requires clients to send their `Mcp-Session-Id`
header on every request (the Streamable HTTP standard behavior). If a
client behaves fully statelessly, requests fail with 400; unset
`STATEFUL` to fall back.

## Optional

| Variable | Effect |
|---|---|
| `STATEFUL=1` | One child per session instead of one per request (recommended once validated with the client) |
| `GATEWAY_BASE_PORT` | First gateway port (default 8807) |
| `FASTMAIL_BULK_CONFIRM_THRESHOLD` | Lower the bulk-confirm gate (default 100) |
| `FASTMAIL_READ_ONLY=1` | Refuse all write tools. Start here, remove later |
| `FASTMAIL_AUDIT_LOG` | Path to a JSONL audit log of bulk operations |

## Deploy

1. Render dashboard: Web Service, runtime Node (not Docker), branch
   `deploy-koyeb`, build `npm install --no-save supergateway http-proxy
   && npm run build`, start `sh start.sh`.
2. Add the environment variables above as secrets.
3. Once deployed, the MCP endpoint is `https://<service>.onrender.com/mcp`,
   authenticated by Bearer token; the health check is `/health` (reports
   mode and account labels).

## Local smoke test

```bash
docker build -t fastmail-mcp .
docker run -p 8000:8000 \
  -e FASTMAIL_ACCOUNTS='[{"label":"me","proxyToken":"...","apiToken":"..."}]' \
  fastmail-mcp

# unauthorized: 401
curl -i http://localhost:8000/mcp
# token accepted, routes to that account's gateway
curl -i -H 'Authorization: Bearer ...' http://localhost:8000/mcp
```

## Notes

- Free-tier services sleep after 15 min idle; first request pays a ~1 min
  cold start. Ping `/health` to wake.
- Every extra account adds an idle gateway (~80 MB): two accounts fit the
  free 512 MB plan; three or more, or sustained load on two accounts at
  once, will be tight.
- CalDav/WebDAV credentials (calendar/files) follow the upstream README
  (`FASTMAIL_CALDAV_USERNAME`, `FASTMAIL_CALDAV_PASSWORD`, ...).
- Do not merge this branch into `main`; it is a deploy overlay. Rebase it
  after syncing the fork with upstream.
