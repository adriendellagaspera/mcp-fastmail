// Babysitter: detect WEDGED supergateways (alive but not answering MCP
// requests) and kill them, so the shell watchdogs can restart them cleanly.
// Probes every configured gateway with a full MCP initialize. In stateful mode
// the response carries Mcp-Session-Id: we DELETE that session right away so
// the probe's child process never lingers, and the probe session never counts
// toward the gateway's session timeout backlog.
import http from 'node:http';
import { exec } from 'node:child_process';

const PORTS = [Number(process.env.GATEWAY_A_PORT) || 8807];
if (process.env.FASTMAIL_API_TOKEN_WIFE)
  PORTS.push(Number(process.env.GATEWAY_B_PORT) || 8808);

const TIMEOUT = 10000;
const INTERVAL = 30000;
const MAX_FAILURES = 2;

const failures = new Map();

function deleteSession(port, sid, done) {
  const del = http.request(
    {
      host: '127.0.0.1', port, path: '/mcp', method: 'DELETE',
      headers: { 'mcp-session-id': sid },
    },
    (res) => { res.resume(); done(); },
  );
  del.on('error', () => done());
  del.end();
}

function probe(port) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'babysitter', version: '1.0' },
      },
    });
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/mcp', method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT,
      },
      (res) => {
        const sid = res.headers['mcp-session-id'];
        const ok = res.statusCode < 500;
        res.resume();
        if (sid) deleteSession(port, sid, () => resolve(ok));
        else resolve(ok);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(false));
    req.end(body);
  });
}

async function loop() {
  for (;;) {
    for (const port of PORTS) {
      const ok = await probe(port);
      if (ok) {
        failures.set(port, 0);
      } else {
        const n = (failures.get(port) || 0) + 1;
        failures.set(port, n);
        console.error('[babysitter] probe :' + port + ' failed (' + n + '/' + MAX_FAILURES + ')');
        if (n >= MAX_FAILURES) {
          console.error('[babysitter] gateway on :' + port + ' wedged, killing all gateways (watchdogs will restart)');
          exec('pkill -f supergateway || true');
          failures.set(port, 0);
        }
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

loop().catch((e) => { console.error(e); process.exit(1); });
