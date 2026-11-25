#!/usr/bin/env bash
# Open the site to your phone through a free Cloudflare quick tunnel (macOS / Linux).
#   SITE_PASSWORD='pick-something-long' ./scripts/public.sh
# Needs: Node 18+ and cloudflared (macOS: brew install cloudflared).
# Your computer has to stay on and awake. Stop with Ctrl+C. The trycloudflare.com address changes
# every time you start this, so open the new one it prints.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${SITE_PASSWORD:-}" ]; then
  echo "Set SITE_PASSWORD first, e.g.  SITE_PASSWORD='pick-something-long' ./scripts/public.sh" >&2
  echo "The tunnel makes the site public; it will not start without a password." >&2
  exit 1
fi
if [ "${#SITE_PASSWORD}" -lt 10 ]; then
  echo "Use a password of at least 10 characters." >&2
  exit 1
fi
command -v cloudflared >/dev/null || { echo "cloudflared is not installed. macOS: brew install cloudflared. Others: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2; exit 1; }

PORT="${PORT:-$(node -p "require('./config.json').port")}"
export PORT SITE_PASSWORD
node server.js &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 2
echo "Starting the tunnel. Open the https://….trycloudflare.com address below on your phone."
echo "Any username works; the password is SITE_PASSWORD."
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}"
