#!/bin/sh
echo "== script sanity (expect rc=2 release not found) =="
sh /usr/share/sunpanel/update.sh delete nope
echo "rc=$?"
echo "== setsid available? =="
command -v setsid || echo "no setsid"
echo "== bg via setsid =="
url="https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
mkdir -p /mnt/mmcblk0p1/sun-panel/app/.state
setsid nohup sh /usr/share/sunpanel/update.sh download-install "V2.0.2-beta26111701" "$url" "-" >/tmp/up-test.log 2>&1 &
sleep 5
echo "== after 5s =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null || echo "(no state)"
ls -la /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null
pgrep -f "update.sh" && echo "process alive" || echo "process DEAD"
