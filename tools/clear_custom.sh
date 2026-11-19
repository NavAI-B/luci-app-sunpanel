#!/bin/sh
d=/mnt/mmcblk0p1/sun-panel/data/custom
b=/mnt/mmcblk0p1/sun-panel/data/custom-js-backup-20261119
mkdir -p "$b"
cp -a "$d/index.js" "$d/index.css" "$b/" 2>/dev/null
rm -f "$d/index.js" "$d/index.css"
echo "== after =="
ls -la "$d" | grep -E "index|js|css" || echo "(index.js/index.css removed)"
ls -la "$b"
echo "== restart =="
/etc/init.d/sunpanel restart
sleep 6
pidof sun-panel
curl -s -o /dev/null -w "panel(browser): %{http_code}\n" -m 8 -A "Mozilla/5.0" -H "Accept: text/html" http://127.0.0.1:3002/
