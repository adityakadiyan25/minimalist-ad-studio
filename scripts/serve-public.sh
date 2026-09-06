#!/usr/bin/env bash
# Start the app and expose it through ngrok. Usage: scripts/serve-public.sh [static-domain]
# Stop with: pkill -f "app.server"; pkill -f "ngrok http"
set -e
cd "$(dirname "$0")/.."
lsof -ti:3000 | xargs kill 2>/dev/null || true
pkill -f "ngrok http" 2>/dev/null || true
nohup .venv/bin/python -m app.server > /tmp/minimalist-app.log 2>&1 &
for i in $(seq 1 20); do curl -sf localhost:3000/api/health >/dev/null && break; sleep 0.5; done
if [ -n "$1" ]; then nohup ngrok http 3000 --domain="$1" --log=stdout > /tmp/minimalist-ngrok.log 2>&1 &
else nohup ngrok http 3000 --log=stdout > /tmp/minimalist-ngrok.log 2>&1 & fi
for i in $(seq 1 20); do curl -sf localhost:4040/api/tunnels >/dev/null && break; sleep 0.5; done
URL=$(curl -s localhost:4040/api/tunnels | python3 -c "import sys,json;t=json.load(sys.stdin)['tunnels'];print(t[0]['public_url'] if t else 'no tunnel')")
echo "App:    http://localhost:3000"
echo "Public: $URL"
