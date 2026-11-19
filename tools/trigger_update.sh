#!/bin/sh
echo "== current state =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null || echo "(none)"
echo "== clean re-trigger =="
url=$(curl -fsS -m 20 -A 'luci-app-sunpanel' https://api.github.com/repos/hslr-s/sun-panel/releases/tags/V2.0.2-beta26111701 | jsonfilter -e '@.assets[@.name="sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"].browser_download_url' 2>/dev/null)
[ -n "$url" ] || url="https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
echo "url: $url"
/usr/libexec/sunpanel-call update-start "V2.0.2-beta26111701" "$url" "-"
sleep 5
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null
ls -la /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null
