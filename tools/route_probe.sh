#!/bin/sh
echo "== web dir =="
ls /mnt/mmcblk0p1/sun-panel/app/web/ | head -n 8
echo "== index.html size/head =="
ls -la /mnt/mmcblk0p1/sun-panel/app/web/index.html
head -c 300 /mnt/mmcblk0p1/sun-panel/app/web/index.html
echo
echo "== route probes on live v2 =="
for p in / /index.html /favicon.ico /favicon-black.svg /api/v1/public/health 2>/dev/null; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3002$p")
  echo "$p -> $code"
done
echo "== v2 startup log (pid 5808) =="
logread | grep "sun-panel\[5808\]" | head -n 15
