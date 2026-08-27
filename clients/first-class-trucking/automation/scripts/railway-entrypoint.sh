#!/usr/bin/env bash
set -euo pipefail

mkdir -p /data/dat-profile /data/runtime /data/.vnc

# Chromium leaves these host-specific lock markers behind when a container is
# force-stopped. A Railway volume survives that container, so clear only the
# lock markers before starting the single replacement browser process.
rm -f -- \
  /data/dat-profile/SingletonCookie \
  /data/dat-profile/SingletonLock \
  /data/dat-profile/SingletonSocket

chown -R pwuser:pwuser /data

exec gosu pwuser /usr/local/bin/railway-runtime
