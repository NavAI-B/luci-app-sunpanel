#!/bin/sh
/etc/init.d/sunpanel enable
/etc/init.d/sunpanel start
sleep 6
echo "== process =="
pidof sun-panel
echo "== procd env injection =="
ubus call service list '{"name": "sunpanel"}' 2>/dev/null | grep -B1 -A3 '"env"' | head -n 6
echo "== panel =="
curl -s -o /dev/null -w "browser %{http_code}\n" -m 8 -A Mozilla/5.0 -H "Accept: text/html" http://127.0.0.1:3002/
echo "== docker api through panel process env (indirect: NAS reachable) =="
curl -s -m 5 "http://192.168.2.252:2375/_ping" && echo " OK"
