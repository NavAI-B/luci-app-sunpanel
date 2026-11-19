#!/bin/sh
i=0
while [ $i -lt 36 ]; do
  st=$(cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null | tr '\n' ' ')
  sz=$(du -sk /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null | awk '{print $1}')
  echo "t=${i}0s state: $st staging:${sz}KB"
  case "$st" in *phase=done*|*phase=failed*) break;; esac
  sleep 10
  i=$((i + 1))
done
echo "== final log =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.log 2>/dev/null
echo "== panel =="
pidof sun-panel
curl -s -o /dev/null -w "panel %{http_code}\n" -m 5 http://127.0.0.1:3002/
/usr/libexec/sunpanel-call info | head -c 400
echo
