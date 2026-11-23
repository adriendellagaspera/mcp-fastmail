// Babysitter: detect a WEDGED supergateway (alive but not answering) and
// kill it, so the shell watchdog can restart it cleanly.
import http from 'node:http';
import { exec } from 'node:child_process';

const UPSTREAM = Number(process.env.UPSTREAM_PORT) || 8807;
const TIMEOUT = 10000;
const INTERVAL = 30000;
const MAX_FAILURES = 2;

let failures = 0;

function probe() {
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
        host: '127.0.0.1', port: UPSTREAM, path: '/mcp', method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT,
      },
      (res) => { res.resume(); resolve(res.statusCode < 500); },
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', () => resolve(false));
    req.end(body);
  });
}

async function loop() {
  for (;;) {
    const ok = await probe();
    if (ok) {
      failures = 0;
    } else {
      failures++;
      console.error('[babysitter] probe failed (' + failures + '/' + MAX_FAILURES + ')');
      if (failures >= MAX_FAILURES) {
        console.error('[babysitter] gateway wedged, killing it (watchdog will restart)');
        exec('pkill -f supergateway || true');
        failures = 0;
      }
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
}

loop().catch(e => { console.error(e); process.exit(1); });
