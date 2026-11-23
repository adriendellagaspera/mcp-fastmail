// Gateway supervisor: one supergateway per Fastmail account, with that
// account's JMAP token in its environment. Restarted forever, 2 s apart.
// The babysitter can pkill wedged gateways; their exit event restarts them.
import { spawn } from 'node:child_process';
import { readAccounts, portOf } from './accounts.mjs';

const STATEFUL_ARGS = process.env.STATEFUL === '1' ? ['--stateful'] : [];

let accounts;
try {
  accounts = readAccounts();
} catch (err) {
  console.error('FATAL (gateways): ' + err.message);
  process.exit(1);
}

console.log(
  '[gateways] mode: ' + (STATEFUL_ARGS.length ? 'stateful' : 'stateless') +
    ', accounts: ' + accounts.map((a) => a.label).join(', '),
);

function supervise(account, port) {
  const tag = '[gateway-' + account.label + ']';
  const start = () => {
    console.log(tag + ' starting on :' + port);
    const child = spawn(
      'npx',
      [
        'supergateway',
        '--stdio', 'node dist/index.js',
        '--outputTransport', 'streamableHttp',
        '--port', String(port),
        '--host', '127.0.0.1',
        ...STATEFUL_ARGS,
      ],
      {
        env: { ...process.env, FASTMAIL_API_TOKEN: account.apiToken },
        stdio: 'inherit',
      },
    );
    child.on('error', (err) => {
      console.error(tag + ' spawn failed: ' + err.message);
      setTimeout(start, 2000);
    });
    child.on('exit', (code, signal) => {
      console.error(
        tag + ' exited (code=' + code + ' signal=' + signal +
          '), restarting in 2s',
      );
      setTimeout(start, 2000);
    });
  };
  start();
}

accounts.forEach((a, i) => supervise(a, portOf(i)));

// Nothing to do in the main thread; keep the process alive.
setInterval(() => {}, 1 << 30);
