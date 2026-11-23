// Minimal auth gate in front of one or two supergateways, one per Fastmail
// account. Each client token routes to the gateway holding that account's
// JMAP token:
//   PROXY_TOKEN (or PROXY_TOKEN_ADRIEN) -> gateway A (8807), Adrien
//   PROXY_TOKEN_WIFE                    -> gateway B (8808), wife
// Accepts "Authorization: Bearer <token>" (standard MCP client auth) or the
// custom "x-mcp-token: <token>" header. 401 otherwise.
// GET /health answers 200 without auth, for platform health checks.
import http from 'node:http';
import proxyPkg from 'http-proxy';

const { createProxyServer } = proxyPkg;

const PORT = Number(process.env.PORT) || 8000;
const GATEWAY_A = Number(process.env.GATEWAY_A_PORT) || 8807;
const GATEWAY_B = Number(process.env.GATEWAY_B_PORT) || 8808;

const TOKEN_A = process.env.PROXY_TOKEN || process.env.PROXY_TOKEN_ADRIEN;
const TOKEN_B = process.env.PROXY_TOKEN_WIFE;
const WIFE_ACCOUNT_ENABLED = Boolean(process.env.FASTMAIL_API_TOKEN_WIFE);
const STATEFUL = process.env.STATEFUL === '1';

const routes = [];
if (TOKEN_A) routes.push({ token: TOKEN_A, port: GATEWAY_A, label: 'adrien' });
if (TOKEN_B && WIFE_ACCOUNT_ENABLED)
  routes.push({ token: TOKEN_B, port: GATEWAY_B, label: 'wife' });
else if (TOKEN_B || WIFE_ACCOUNT_ENABLED)
  console.error(
    'WARN: second account needs BOTH PROXY_TOKEN_WIFE and ' +
      'FASTMAIL_API_TOKEN_WIFE; the wife route is disabled until then',
  );

if (routes.length === 0) {
  console.error(
    'FATAL: no proxy token configured (PROXY_TOKEN). ' +
      'Refusing to start exposed without auth.',
  );
  process.exit(1);
}

const proxy = createProxyServer();

proxy.on('error', (err, req, res) => {
  if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'upstream unavailable', detail: String(err && err.message) }));
});

function tokenOf(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  if (typeof req.headers['x-mcp-token'] === 'string') return req.headers['x-mcp-token'];
  return undefined;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        mode: STATEFUL ? 'stateful' : 'stateless',
        accounts: routes.map((r) => r.label),
      }),
    );
    return;
  }
  const token = tokenOf(req);
  const route = token && routes.find((r) => r.token === token);
  if (!route) {
    res.writeHead(401, {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="fastmail-mcp"',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  proxy.web(req, res, { target: 'http://127.0.0.1:' + route.port });
});

server.listen(PORT, () => {
  console.log(
    'auth proxy listening on :' + PORT + ', routes: ' +
      routes.map((r) => r.label + '->' + r.port).join(', ') +
      ' (mode: ' + (STATEFUL ? 'stateful' : 'stateless') + ')',
  );
});
