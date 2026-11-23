// Minimal auth gate in front of one supergateway per Fastmail account.
// The token a client presents (Authorization: Bearer or x-mcp-token)
// selects the account, hence the gateway and the JMAP token behind it.
// Configuration lives in FASTMAIL_ACCOUNTS (see accounts.mjs), or the
// legacy single-account secrets. GET /health answers 200 without auth.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import proxyPkg from 'http-proxy';
import { readAccounts, portOf } from './accounts.mjs';

const { createProxyServer } = proxyPkg;

const PORT = Number(process.env.PORT) || 8000;
const STATEFUL = process.env.STATEFUL === '1';

let accounts;
try {
  accounts = readAccounts();
} catch (err) {
  console.error('FATAL (auth proxy): ' + err.message);
  process.exit(1);
}
if (accounts.length === 0) {
  console.error(
    'FATAL: no account configured. Refusing to start exposed without auth.',
  );
  process.exit(1);
}

const routes = accounts.map((a, i) => ({
  label: a.label,
  token: a.proxyToken,
  port: portOf(i),
}));

const proxy = createProxyServer();

proxy.on('error', (err, req, res) => {
  if (!res.headersSent)
    res.writeHead(502, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'upstream unavailable',
      detail: String(err && err.message),
    }),
  );
});

function sameToken(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function tokenOf(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  if (typeof req.headers['x-mcp-token'] === 'string')
    return req.headers['x-mcp-token'];
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
  const route = token && routes.find((r) => sameToken(token, r.token));
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
