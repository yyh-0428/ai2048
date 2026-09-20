#!/bin/sh
set -eu
HTML="$1"
PORT="$2"
RESPONSE="$(dirname "$HTML")/.2048-ai-response-$$"
CHILD=''
cleanup(){
  trap - EXIT INT TERM HUP
  if [ -n "$CHILD" ]; then kill "$CHILD" 2>/dev/null || true; wait "$CHILD" 2>/dev/null || true; fi
  rm -f "$RESPONSE"
}
trap cleanup EXIT
trap 'exit 0' INT TERM HUP
while :; do
  LEN=$(/usr/bin/wc -c < "$HTML" | /usr/bin/tr -d ' ')
  {
    /usr/bin/printf 'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n'
    /usr/bin/printf 'Content-Length: %s\r\nConnection: close\r\n' "$LEN"
    /usr/bin/printf 'Cross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\nCross-Origin-Resource-Policy: same-origin\r\nCache-Control: no-store\r\n\r\n'
    cat "$HTML"
  } > "$RESPONSE"
  /usr/bin/nc -l 127.0.0.1 "$PORT" < "$RESPONSE" >/dev/null 2>&1 &
  CHILD=$!
  if ! wait "$CHILD"; then CHILD=''; exit 1; fi
  CHILD=''
done
