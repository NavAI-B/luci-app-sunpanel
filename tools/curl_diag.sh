#!/bin/sh
echo "== v1 on 3002: health-style curl =="
curl -fs -m 3 "http://127.0.0.1:3002/" >/dev/null 2>&1; echo "rc=$?"
echo "== verbose =="
curl -v -m 3 "http://127.0.0.1:3002/" 2>&1 | head -n 12
echo "== sp_port from common.sh =="
. /usr/share/sunpanel/common.sh
echo "sp_port=$(sp_port)"
echo "== curl version =="
curl --version | head -n 1
