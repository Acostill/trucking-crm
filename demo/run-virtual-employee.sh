#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$PROJECT_DIR/client"
DEMO_URL="${DEMO_BASE_URL:-http://127.0.0.1:3000}"
DEMO_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fctl-demo.XXXXXX")"
CLIENT_LOG="$DEMO_LOG_DIR/client.log"
CLIENT_PID=""

cleanup() {
  if [[ -n "$CLIENT_PID" ]] && kill -0 "$CLIENT_PID" 2>/dev/null; then
    kill "$CLIENT_PID" 2>/dev/null || true
    wait "$CLIENT_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ ! -d "$CLIENT_DIR/node_modules/@playwright/test" ]]; then
  echo
  echo "Playwright dependencies are not installed."
  echo "Run: cd \"$CLIENT_DIR\" && npm install"
  echo
  exit 1
fi

if ! curl --silent --fail --max-time 2 "$DEMO_URL/portal/quote?preview=1" >/dev/null 2>&1; then
  echo "Starting the First Class Trucking demo workspace..."
  (
    cd "$CLIENT_DIR"
    BROWSER=none HOST=127.0.0.1 npm start
  ) >"$CLIENT_LOG" 2>&1 &
  CLIENT_PID=$!

  for _ in {1..120}; do
    if curl --silent --fail --max-time 2 "$DEMO_URL/portal/quote?preview=1" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
      echo
      echo "The demo workspace stopped before it was ready:"
      tail -n 50 "$CLIENT_LOG"
      exit 1
    fi
    sleep 0.5
  done
fi

if ! curl --silent --fail --max-time 2 "$DEMO_URL/portal/quote?preview=1" >/dev/null 2>&1; then
  echo
  echo "The demo workspace did not become ready at $DEMO_URL."
  echo "Recent output:"
  tail -n 50 "$CLIENT_LOG" 2>/dev/null || true
  exit 1
fi

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FIRST CLASS TRUCKING · VIRTUAL EMPLOYEE DEMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "A browser will open and build the quote automatically."
echo "Click “Start virtual employee” when you are ready."
echo "When it pauses, click “Approve and create quote.”"
echo "Click “End demo” after presenting the completed quote."
echo

cd "$CLIENT_DIR"
DEMO_BASE_URL="$DEMO_URL" npm run demo:virtual-employee
