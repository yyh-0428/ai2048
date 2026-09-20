#!/bin/sh
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PIDFILE="$DIR/.2048-ai-server.pid"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null || true)
  case "$PID" in ''|*[!0-9]*) ;; *)
    COMMAND=$(/bin/ps -p "$PID" -o command= 2>/dev/null || true)
    case "$COMMAND" in *"$DIR/server-nc.sh"*) /bin/kill "$PID" 2>/dev/null || true;; esac
  esac
fi
rm -f "$PIDFILE" "$DIR/.2048-ai-server.port"
/usr/bin/osascript -e 'display notification "2048 AI 本地服务已停止" with title "2048 AI"' 2>/dev/null || true
