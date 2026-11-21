#!/bin/sh
nas=192.168.2.252
for p in 9 20 21 22 80 443 445 5000 5001 5666 6443 8000 8006 8080 8090 8443 9000 9443 2375 2376 3306 5432 8096 8920 10000; do
  nc -zw2 $nas $p 2>/dev/null && echo "$p OPEN"
done
echo "scan done"
