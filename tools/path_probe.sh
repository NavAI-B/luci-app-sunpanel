#!/bin/sh
cd /mnt/mmcblk0p1/sun-panel/app
if ! pgrep -f "sun-panel -config-path /tmp/v2c" >/dev/null; then
  setsid ./sun-panel -config-path /tmp/v2c </dev/null >/tmp/v2c.log 2>&1 &
  sleep 5
fi
echo "== 301 target =="
curl -sI -m 3 "http://127.0.0.1:3005/index.html" | grep -iE "HTTP|Location"
echo "== path probes =="
for p in / /login /setup /index.html /web/ /panel /home /app /ui /dashboard /api/v1/ /api/ 2>/dev/null; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3005$p")
  echo "$p -> $code"
done
echo "== root with browser-ish headers =="
curl -s -o /dev/null -w "%{http_code}\n" -m 3 -A "Mozilla/5.0" -H "Accept: text/html" "http://127.0.0.1:3005/"
