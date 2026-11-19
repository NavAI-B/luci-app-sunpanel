#!/bin/sh
scp_target=/usr/share/sunpanel/update.sh
echo "== deploy fixed update.sh =="
echo "(pushed via scp from workstation)"
url="https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
setsid sh /usr/share/sunpanel/update.sh download-install "V2.0.2-beta26111701" "$url" "-" </dev/null >/dev/null 2>&1 &
sleep 3
i=0
while [ $i -lt 40 ]; do
  st=$(cat /mnt/mmcblk0p1/sun-panel/app/.state/update.state 2>/dev/null | tr '\n' ' ')
  echo "t=$((i * 10))s $st"
  case "$st" in
    *phase=done*|*phase=failed*) break ;;
  esac
  sleep 10
  i=$((i + 1))
done
echo "=== log ==="
cat /mnt/mmcblk0p1/sun-panel/app/.state/update.log 2>/dev/null
echo "=== panel (browser headers) ==="
pidof sun-panel
curl -s -o /dev/null -w "plain: %{http_code}\n" -m 5 http://127.0.0.1:3002/
curl -s -o /dev/null -w "browser: %{http_code}\n" -m 5 -A "Mozilla/5.0" -H "Accept: text/html" http://127.0.0.1:3002/
/usr/libexec/sunpanel-call info | head -c 420
echo
