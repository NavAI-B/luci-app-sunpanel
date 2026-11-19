#!/bin/sh
echo "== route probes on live v2 =="
for p in / /index.html /favicon.ico /api/test; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3002$p")
  echo "$p -> $code"
done
echo "== v2 full startup log (pid 5808) =="
logread | grep "sun-panel\[5808\]" | head -n 25
echo "== web dir perms =="
ls -la /mnt/mmcblk0p1/sun-panel/app/ /mnt/mmcblk0p1/sun-panel/app/web/ | head -n 20
