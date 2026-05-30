#!/usr/bin/env bash
# Validate deploy/Caddyfile under the APEX_ADDRESS values the prod compose file
# can actually produce. Regression guard for the incident where an EMPTY
# APEX_ADDRESS produced an empty Caddy site label ("server block without any
# key is global configuration") and crash-looped caddy, taking down all ingress.
#
# Caddy's {$VAR:default} only substitutes its default when the var is *unset*,
# not when it's set to an empty string. The compose file is what controls the
# value the container actually receives, so we derive the value compose passes
# when the operator hasn't set APEX_ADDRESS, and prove the Caddyfile is valid
# with it (and with a real apex). An empty compose default fails this script.
#
# Requires the `caddy` binary on PATH. Run from anywhere; resolves repo root.
set -euo pipefail

cd "$(dirname "$0")/.."
CF=deploy/Caddyfile
COMPOSE=docker-compose.prod.yml

# Pull the default out of:  - APEX_ADDRESS=${APEX_ADDRESS:-<default>}
default=$(grep -oE 'APEX_ADDRESS=\$\{APEX_ADDRESS:-[^}]*\}' "$COMPOSE" | sed -E 's/.*:-([^}]*)\}/\1/' || true)
if [ -z "${default}" ]; then
  echo "FAIL: ${COMPOSE} must give APEX_ADDRESS a NON-EMPTY default, i.e."
  echo "      \${APEX_ADDRESS:-<some.host>}. An empty value (\${APEX_ADDRESS:-} or"
  echo "      bare \${APEX_ADDRESS}) makes Caddy see an empty site label and crash"
  echo "      with 'server block without any key is global configuration'."
  exit 1
fi
echo "compose APEX_ADDRESS default = '${default}'"

validate() { # $1 = APEX_ADDRESS value to test
  if SITE_ADDRESS=staging.unbnd.ink APEX_ADDRESS="$1" \
      caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
    echo "  ok: APEX_ADDRESS='$1'"
  else
    echo "FAIL: Caddyfile invalid with APEX_ADDRESS='$1'" >&2
    SITE_ADDRESS=staging.unbnd.ink APEX_ADDRESS="$1" \
      caddy validate --config "$CF" --adapter caddyfile 2>&1 | tail -3 >&2
    exit 1
  fi
}

# The unset-operator path (compose default) and a real apex must both validate.
validate "${default}"
validate "unbnd.ink"
echo "OK: Caddyfile valid under the compose default and a real apex."
