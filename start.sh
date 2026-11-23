#!/bin/sh
set -e

# One supervised supergateway per Fastmail account (config in accounts.mjs),
# then the babysitter, then the authenticated front proxy as PID 1.
node gateways.mjs &
node babysitter.mjs &
exec node auth-proxy.mjs
