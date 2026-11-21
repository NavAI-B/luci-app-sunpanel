#!/bin/sh
echo "=== docker link status ==="
echo "uci docker_host: $(uci -q get sunpanel.sunpanel.docker_host || echo '(unset)')"
echo "procd env:"
ubus call service list '{"name": "sunpanel"}' 2>/dev/null | grep -A2 '"env"' | head -n 4
curl -s -m 5 "http://192.168.2.252:2375/_ping" && echo " <- NAS docker API OK" || echo "NAS 2375 unreachable"
curl -s -m 5 "http://192.168.2.252:2375/containers/json" | head -c 200
echo
echo "=== cleanup: session debris ==="
rm -rf /tmp/up-test.log /tmp/v2run.log /tmp/v2c /tmp/v2c2 /tmp/v2c.log /tmp/v2c2.log \
       /tmp/spkeys /tmp/rels.json /tmp/ud.sh /tmp/np.sh /tmp/np2.sh /tmp/ad.sh \
       /tmp/bd.sh /tmp/bt2.sh /tmp/wu.sh /tmp/wu2.sh /tmp/vd.sh /tmp/cd.sh \
       /tmp/ci.sh /tmp/rs.sh /tmp/ri.sh /tmp/ri2.sh /tmp/rp.sh /tmp/rp2.sh \
       /tmp/pp.sh /tmp/pp2.sh /tmp/ns.sh /tmp/fc.sh /tmp/si.sh /tmp/tu.sh \
       /tmp/ab.sh /tmp/cc.sh /tmp/vd.sh /tmp/dbg 2>/dev/null
echo "tmp cleaned"
echo "=== staging / rollback leftovers ==="
ls -la /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null && echo "(staging has content)" || echo "staging clean"
ls -la /mnt/mmcblk0p1/sun-panel/app/releases/ 2>/dev/null
ls -la /mnt/mmcblk0p1/sun-panel/app/releases/rollback-tmp/ 2>/dev/null && echo "(rollback-tmp exists)" || echo "no rollback-tmp"
echo "=== panel final ==="
pidof sun-panel
curl -s -o /dev/null -w "browser %{http_code}\n" -m 5 -A Mozilla/5.0 -H "Accept: text/html" http://127.0.0.1:3002/
