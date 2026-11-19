#!/bin/sh
echo "== update.state =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null || echo "(no state file)"
echo "== update.log =="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.log 2>/dev/null || echo "(no log)"
echo "== staging =="
ls -la /mnt/mmcblk0p1/sun-panel/app/.staging/ 2>/dev/null || echo "(no staging)"
echo "== app dir =="
ls -la /mnt/mmcblk0p1/sun-panel/app/ 2>/dev/null
echo "== curl github test (10s) =="
curl -s -o /dev/null -w "api.github.com: %{http_code} %{time_total}s\n" -m 10 https://api.github.com/repos/hslr-s/sun-panel/releases/latest
curl -s -o /dev/null -w "github release dl: %{http_code} %{time_total}s downloaded=%{size_download}\n" -m 10 -r 0-1000000 -L "https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
