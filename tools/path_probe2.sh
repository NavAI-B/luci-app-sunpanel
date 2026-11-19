#!/bin/sh
echo "== 301 target confirmed =="
curl -sI -m 3 "http://127.0.0.1:3005/index.html" | grep -iE "HTTP|Location"
echo "== path probes =="
for p in / /login /setup /index.html /web/ /panel /home /ui /dashboard /api/v1/ /api/; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3005$p")
  echo "$p -> $code"
done
echo "== root with browser headers =="
curl -s -o /dev/null -w "%{http_code}\n" -m 3 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -H "Accept: text/html,application/xhtml+xml" "http://127.0.0.1:3005/"
echo "== root HEAD =="
curl -sI -m 3 "http://127.0.0.1:3005/" | head -n 5
