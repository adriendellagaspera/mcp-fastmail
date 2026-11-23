// Minimal auth gate in front of supergateway.
// Accepts either "Authorization: Bearer <PROXY_TOKEN>" (standard MCP client auth)
// or the custom "x-mcp-token: <PROXY_TOKEN>" header. 401 otherwise.
// GET /health answers 200 without auth, for platform health checks.
import http from 'node:http';
import proxyPkg from 'http-proxy';

const { createProxyServer } = proxyPkg;

const PORT = Number(process.env.PORT) || 8000;
const UPSTREAM = process.env.UPSTREAM_PORT || 8807;
const TOKEN = process.env.PROXY_TOKEN;

if (!TOKEN) {
  console.error('FATAL: PROXY_TOKEN is not set. Refusing to start exposed without auth.');
  process.exit(1);
}

const proxy = createProxyServer({ target: 'http://127.0.0.1:' + UPSTREAM });

proxy.on('error', (err, req, res) => {
  if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'upstream unavailable', detail: String(err && err.message) }));
});

function authorized(req) {
  const auth = req.headers['authorization'] || '';
  if (auth === 'Bearer ' + TOKEN) return true;
  if (req.headers['x-mcp-token'] === TOKEN) return true;
  return false;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="fastmail-mcp"',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  proxy.web(req, res);
});

server.listen(PORT, () => {
  console.log('auth proxy listening on :' + PORT + ', forwarding to :' + UPSTREAM);
});
