#!/bin/sh
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  st=$(cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null | tr '\n' ' ')
  sz=$(du -sk /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null | awk '{print $1}')
  echo "t=$((i * 15))s state: $st staging:${sz}KB"
  case "$st" in
    *phase=done*|*phase=failed*) break ;;
  esac
  sleep 15
done
echo "=== update.log ==="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.log 2>/dev/null
echo "=== panel ==="
pidof sun-panel
curl -s -o /dev/null -w "panel %{http_code}\n" -m 5 http://127.0.0.1:3002/
/usr/libexec/sunpanel-call info | head -c 420
echo
