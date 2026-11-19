#!/bin/sh
echo "== syslog around update =="
logread | grep -iE "sun-panel|sunpanel" | tail -n 25
echo "== rendered conf =="
grep -vE "^#|^$" /mnt/mmcblk0p1/sun-panel/data/conf/conf.ini 2>/dev/null
echo "== manual v2 run (10s) =="
mkdir -p /mnt/mmcblk0p1/sun-panel/data/conf
/mnt/mmcblk0p1/sun-panel/app/sun-panel -config-path /mnt/mmcblk0p1/sun-panel/data/conf > /tmp/v2run.log 2>&1 &
p=$!
sleep 10
curl -s -o /dev/null -w "v2 direct: %{http_code}\n" -m 5 http://127.0.0.1:3002/
kill $p 2>/dev/null
sleep 1
echo "== v2 output =="
cat /tmp/v2run.log
