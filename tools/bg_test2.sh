#!/bin/sh
url="https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
setsid sh /usr/share/sunpanel/update.sh download-install "V2.0.2-beta26111701" "$url" "-" </dev/null >/dev/null 2>&1 &
sleep 5
echo "== after 5s =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null || echo "(no state)"
pgrep -f update.sh >/dev/null && echo "process alive" || echo "process dead"
