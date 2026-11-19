#!/bin/sh
echo "== before =="
ps | grep -v grep | grep sun-panel
/etc/init.d/sunpanel stop
kill 11269 9717 2>/dev/null
sleep 2
kill -9 11269 9717 2>/dev/null
echo "== clean start =="
/etc/init.d/sunpanel start
sleep 5
echo "== after =="
pidof sun-panel
ps | grep -v grep | grep sun-panel
netstat -tln 2>/dev/null | grep 3002
curl -s -o /dev/null -w "browser-curl: %{http_code}\n" -m 5 -A "Mozilla/5.0" -H "Accept: text/html" http://127.0.0.1:3002/
