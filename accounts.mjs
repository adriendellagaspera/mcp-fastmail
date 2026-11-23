// Shared account configuration for the gateway supervisor, the auth proxy
// and the babysitter. Accounts live in ONE secret, FASTMAIL_ACCOUNTS, as JSON.
//
// Recommended form (labels for logs and /health):
//   [{"label":"adrien","proxyToken":"<hex>","apiToken":"<jmap>"},
//    {"label":"spouse","proxyToken":"<hex>","apiToken":"<jmap>"}]
//
// Shorthand form is also accepted (labels are then account-1, account-2, ...):
//   {"<proxyToken>": "<apiToken>", ...}
//
// The proxy token is what MCP clients present (Bearer / x-mcp-token); the
// api token is the Fastmail JMAP token injected into that account's gateway
// child processes. If FASTMAIL_ACCOUNTS is unset, the single-account secrets
// PROXY_TOKEN (+ alias PROXY_TOKEN_ADRIEN) and FASTMAIL_API_TOKEN
// (+ alias FASTMAIL_API_TOKEN_ADRIEN) are used for backwards compatibility.

function str(v) {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function portOf(index, env) {
  return (Number((env || process.env).GATEWAY_BASE_PORT) || 8807) + index;
}

export function readAccounts(env) {
  const e = env || process.env;
  const raw = e.FASTMAIL_ACCOUNTS;
  if (raw && raw.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error('FASTMAIL_ACCOUNTS: invalid JSON (' + err.message + ')');
    }
    const accounts = [];
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const label = str(entry && entry.label);
        const proxyToken = str(entry && entry.proxyToken);
        const apiToken = str(entry && entry.apiToken);
        if (!label || !proxyToken || !apiToken)
          throw new Error(
            'FASTMAIL_ACCOUNTS: every entry needs non-empty string ' +
              'label, proxyToken and apiToken',
          );
        accounts.push({ label, proxyToken, apiToken });
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const [proxyToken, apiToken] of Object.entries(parsed)) {
        if (!str(proxyToken) || !str(apiToken))
          throw new Error(
            'FASTMAIL_ACCOUNTS: the object form maps proxyToken -> apiToken, ' +
              'both non-empty strings',
          );
        accounts.push({
          label: 'account-' + (accounts.length + 1),
          proxyToken,
          apiToken,
        });
      }
    } else {
      throw new Error(
        'FASTMAIL_ACCOUNTS: expected a JSON array of ' +
          '{label, proxyToken, apiToken} objects, or an object map',
      );
    }
    const seen = new Set();
    for (const a of accounts) {
      if (seen.has(a.label))
        throw new Error('FASTMAIL_ACCOUNTS: duplicate label "' + a.label + '"');
      seen.add(a.label);
    }
    if (accounts.length === 0)
      throw new Error('FASTMAIL_ACCOUNTS: account list is empty');
    return accounts;
  }

  // Legacy single-account configuration.
  const proxyToken = e.PROXY_TOKEN || e.PROXY_TOKEN_ADRIEN;
  const apiToken = e.FASTMAIL_API_TOKEN || e.FASTMAIL_API_TOKEN_ADRIEN;
  if (proxyToken && apiToken)
    return [{ label: 'main', proxyToken, apiToken }];
  if (proxyToken || apiToken)
    throw new Error(
      'incomplete single-account config: provide FASTMAIL_ACCOUNTS, or both ' +
        'PROXY_TOKEN and FASTMAIL_API_TOKEN',
    );
  return [];
}
