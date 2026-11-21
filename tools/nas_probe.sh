#!/bin/sh
nas=192.168.2.252
echo "== port probe (nc) =="
for p in 2375 2376 22 9 443; do
  nc -zw2 $nas $p 2>/dev/null && echo "$p OPEN" || echo "$p closed"
done
echo "== docker API probe =="
curl -s -m 5 "http://$nas:2375/_ping" && echo " <- 2375 docker ping OK" || echo "2375 no api"
curl -s -m 5 -k "https://$nas:2376/_ping" && echo " <- 2376 TLS ping OK" || echo "2376 no api"
echo "== ssh banner =="
ssh -o BatchMode=yes -o ConnectTimeout=5 -p 22 root@$nas exit 2>&1 | head -n 2
