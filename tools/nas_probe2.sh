#!/bin/sh
nas=192.168.2.252
echo "== precise TCP probe (curl connect) =="
for p in 2375 2376 8090 22; do
  code=$(curl -s -o /dev/null --connect-timeout 3 -w "%{http_code}" "http://$nas:$p/_ping" 2>/dev/null)
  rc=$?
  case $rc in
    0)   echo "$p -> HTTP $code (OPEN, service replied)";;
    7)   echo "$p -> connection refused / not listening";;
    28)  echo "$p -> timeout (filtered)";;
    *)   echo "$p -> curl rc=$rc";;
  esac
done
echo "== 22 (ssh) via dropbear client =="
(dbclient -y -T -p 22 root@$nas "exit" 2>&1 | head -n 1) || true
echo done
