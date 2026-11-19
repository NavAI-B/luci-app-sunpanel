#!/bin/sh
echo "== step1: stop service =="
/etc/init.d/sunpanel stop
sleep 2
echo "== port 3002 after stop =="
netstat -tln 2>/dev/null | grep 3002 || echo "(free)"
echo "== step2: start service =="
/etc/init.d/sunpanel start
sleep 4
echo "== port 3002 after start =="
netstat -tln 2>/dev/null | grep 3002 || echo "(NOT LISTENING)"
echo "== process =="
ps | grep -v grep | grep sun-panel
echo "== curl -f =="
curl -fs -m 3 "http://127.0.0.1:3002/" >/dev/null 2>&1; echo "rc=$?"
echo "== recent syslog =="
logread | grep -iE "sun-panel\[|sunpanel:" | tail -n 12
