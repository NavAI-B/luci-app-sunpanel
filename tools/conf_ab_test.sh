#!/bin/sh
cd /mnt/mmcblk0p1/sun-panel/app
rm -rf /tmp/v2c
mkdir -p /tmp/v2c
./sun-panel -config-path /tmp/v2c -config-reset >/dev/null 2>&1
sed -i 's/^http_port=3002/http_port=3005/' /tmp/v2c/conf.ini
setsid ./sun-panel -config-path /tmp/v2c </dev/null >/tmp/v2c.log 2>&1 &
sleep 6
echo "== default-conf v2 on 3005 =="
for p in / /index.html /favicon.ico; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3005$p")
  echo "$p -> $code"
done
echo "== log =="
cat /tmp/v2c.log | head -n 12
kill $(pidof sun-panel | grep -oE '^[0-9]+' | head -n 1) 2>/dev/null
echo "== now same test with OUR conf (copy) on 3006 =="
mkdir -p /tmp/v2c2
cp /mnt/mmcblk0p1/sun-panel/data/conf/conf.ini /tmp/v2c2/conf.ini
sed -i 's/^http_port=3002/http_port=3006/' /tmp/v2c2/conf.ini
setsid ./sun-panel -config-path /tmp/v2c2 </dev/null >/tmp/v2c2.log 2>&1 &
sleep 6
for p in / /index.html /favicon.ico; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:3006$p")
  echo "$p -> $code"
done
echo "== log =="
cat /tmp/v2c2.log | head -n 12
kill $(pidof sun-panel) 2>/dev/null
