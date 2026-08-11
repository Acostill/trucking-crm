#!/usr/bin/env bash
set -euo pipefail

Xvfb :99 -screen 0 1440x900x24 -ac -nolisten tcp >/tmp/xvfb.log 2>&1 &
for _attempt in $(seq 1 50); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if ! xdpyinfo -display :99 >/dev/null 2>&1; then
  echo '{"status":"STARTUP_ERROR","message":"Virtual display did not start."}' >&2
  exit 1
fi
fluxbox -display :99 >/tmp/fluxbox.log 2>&1 &

service_mode="${DAT_SERVICE_MODE:-worker}"
if [[ "${service_mode}" == "auth" ]]; then
  vnc_password="${DAT_VNC_PASSWORD:-}"
  if [[ "${#vnc_password}" -ne 8 ]]; then
    echo '{"status":"STARTUP_ERROR","message":"DAT_VNC_PASSWORD must be exactly 8 characters in auth mode."}' >&2
    exit 1
  fi
  x11vnc -storepasswd "${vnc_password}" /data/.vnc/passwd >/dev/null
  chmod 0600 /data/.vnc/passwd
  x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth /data/.vnc/passwd >/tmp/x11vnc.log 2>&1 &
  websockify --web=/usr/share/novnc/ "${PORT:-8080}" localhost:5900 >/tmp/websockify.log 2>&1 &
  exec npm run auth:cloud
fi

if [[ "${service_mode}" != "worker" ]]; then
  echo '{"status":"STARTUP_ERROR","message":"DAT_SERVICE_MODE must be auth or worker."}' >&2
  exit 1
fi

exec npm run worker
