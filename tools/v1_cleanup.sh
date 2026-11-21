#!/bin/sh
echo "=== pre-checks ==="
# v2 must be healthy before we touch v1
pidof sun-panel >/dev/null || { echo "v2 not running, ABORT"; exit 1; }
curl -fs -m 5 -A Mozilla/5.0 -H "Accept: text/html" http://127.0.0.1:3002/ >/dev/null || { echo "v2 not responding, ABORT"; exit 1; }
[ -x /mnt/mmcblk0p1/sun-panel/app/sun-panel ] || { echo "v2 binary missing, ABORT"; exit 1; }
echo "v2 healthy, proceeding"

df -m /mnt/mmcblk0p1 /overlay 2>/dev/null | head -n 4
echo

echo "=== what will be removed ==="
du -sh /usr/sbin/sun-panel 2>/dev/null
du -sh /mnt/mmcblk0p1/Configs/SunPanel 2>/dev/null
ls /usr/share/sunpanel/ 2>/dev/null
echo

echo "=== 1. v1 binary ==="
rm -f /usr/sbin/sun-panel && echo "removed /usr/sbin/sun-panel"

echo "=== 2. v1 web/runtime leftovers (keep plugin scripts) ==="
rm -rf /usr/share/sunpanel/web
rm -f  /usr/share/sunpanel/version
rm -f  /usr/share/sunpanel/conf.temp
rm -f  /usr/share/sunpanel/sunpanel_conf.lua
rm -f  /usr/share/sunpanel/sunpanel_upgrade.sh
rm -rf /usr/share/sunpanel/conf
rm -rf /usr/share/sunpanel/.selfcheck
ls -la /usr/share/sunpanel/

echo "=== 3. v1 data directory ==="
rm -rf /mnt/mmcblk0p1/Configs/SunPanel
# remove parent if now empty
rmdir /mnt/mmcblk0p1/Configs 2>/dev/null && echo "removed empty /mnt/mmcblk0p1/Configs" || echo "parent Configs kept (not empty)"

echo "=== 4. v1 config backup + uci residue ==="
rm -f /etc/config/sunpanel.v1bak
uci -q delete sunpanel.sunpanel.legacy_v1_dir
uci commit sunpanel
echo done

echo "=== final state ==="
pidof sun-panel
curl -s -o /dev/null -w "browser %{http_code}\n" -m 5 -A Mozilla/5.0 -H "Accept: text/html" http://127.0.0.1:3002/
df -m /mnt/mmcblk0p1 /overlay 2>/dev/null | head -n 4
echo CLEANUP_DONE
