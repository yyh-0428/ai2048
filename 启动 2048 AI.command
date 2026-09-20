#!/bin/sh
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HTML="$DIR/2048-ai.html"
SERVER="$DIR/server-nc.sh"
PIDFILE="$DIR/.2048-ai-server.pid"
PORTFILE="$DIR/.2048-ai-server.port"
LOGFILE="$DIR/.2048-ai-server.log"
PORT=20480
if [ ! -f "$HTML" ]; then
  /usr/bin/osascript -e 'display alert "2048 AI 启动失败" message "找不到 2048-ai.html，请完整解压文件夹。" as critical'
  exit 1
fi
# Keep the same origin on every launch so scores/settings/progress can persist.
# A stale PID file must never authorize killing an unrelated process.
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null || true)
  case "$OLD_PID" in ''|*[!0-9]*) ;; *)
    OLD_COMMAND=$(/bin/ps -p "$OLD_PID" -o command= 2>/dev/null || true)
    case "$OLD_COMMAND" in *"$SERVER"*) /bin/kill "$OLD_PID" 2>/dev/null || true; /bin/sleep 0.15;; esac
  esac
  rm -f "$PIDFILE" "$PORTFILE"
fi
if [ -x /usr/bin/nc ]; then
  /usr/bin/nohup /bin/sh "$SERVER" "$HTML" "$PORT" >"$LOGFILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PIDFILE"
  echo "$PORT" > "$PORTFILE"
  /bin/sleep 0.3
  if /bin/kill -0 "$PID" 2>/dev/null; then
    /usr/bin/open "http://127.0.0.1:$PORT/"
    exit 0
  fi
  rm -f "$PIDFILE" "$PORTFILE"
fi
# No alternate/random port: that would silently create another storage origin.
# The self-contained HTML also works as a local file in supporting browsers.
/usr/bin/open "$HTML"
