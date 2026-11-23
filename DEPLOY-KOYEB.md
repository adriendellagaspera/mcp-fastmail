# Deploy on Koyeb

This branch (`deploy-koyeb`) adds container deployment on top of the fork,
so the MCP server built from this repo's own source is reachable over
Streamable HTTP: `https://<app>.koyeb.app/mcp`.

## Layers

1. `dist/index.js` — the MCP server (stdio), built from the source in this repo.
2. `supergateway` — exposes it as Streamable HTTP on.loopback port 8807.
3. `auth-proxy.mjs` — the only public port. Requires `x-mcp-token: <PROXY_TOKEN>`
   on every request. Without it the process refuses to start, so the server is
   never accidentally exposed while holding a live Fastmail token.

## Required environment variables (Koyeb secrets)

| Variable | Value |
|---|---|
| `FASTMAIL_API_TOKEN` | Fastmail JMAP API token (Settings > Privacy & Security > Integrations). Scopes: Email + Email submission (+ Contacts, Masked Email if used) |
| `PROXY_TOKEN` | Long random secret, sent by MCP clients as the `x-mcp-token` header. Generate with `openssl rand -hex 32` |

## Recommended (optional)

| Variable | Effect |
|---|---|
| `FASTMAIL_BULK_CONFIRM_THRESHOLD` | Lower the bulk-confirm gate (default 100) |
| `FASTMAIL_READ_ONLY=1` | Refuse all write tools. Start here, remove later |
| `FASTMAIL_AUDIT_LOG` | Path to a JSONL audit log of bulk operations |

## Deploy

1. Koyeb dashboard > Create App > GitHub > this repo, branch `deploy-koyeb`,
   builder **Dockerfile**, instance **Free**, region Paris or Frankfurt.
2. Add the environment variables above as secrets.
3. Once deployed, the MCP endpoint is `https://<app>-<org>.koyeb.app/mcp`,
   authenticated by the `x-mcp-token` header.

## Local smoke test

```bash
docker build -t fastmail-mcp .
docker run -p 8000:8000 \
  -e FASTMAIL_API_TOKEN=... -e PROXY_TOKEN=... fastmail-mcp

# unauthorized: 401
curl -i http://localhost:8000/mcp
# token accepted
curl -i -H 'x-mcp-token: ...' http://localhost:8000/mcp
```

## Notes

- Free-tier apps scale to zero after ~1h idle; first request pays a short cold start.
- CalDAV/WebDAV credentials (calendar/files) follow the upstream README
  (`FASTMAIL_CALDAV_USERNAME`, `FASTMAIL_CALDAV_PASSWORD`, ...).
- Do not merge this branch into `main`; it is a deploy overlay. Rebase it after
  syncing the fork with upstream.
