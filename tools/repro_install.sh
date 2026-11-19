#!/bin/sh
url="https://github.com/hslr-s/sun-panel/releases/download/V2.0.2-beta26111701/sun-panel_v2.0.2-beta26111701_linux_arm64.tar.gz"
app="/mnt/mmcblk0p1/sun-panel/app"
tag="V2.0.2-beta26111701"

echo "== 1. download =="
mkdir -p "$app/.staging"
curl -fL --retry 2 -m 600 -A 'luci-app-sunpanel/1.0' -o "$app/.staging/dl.tar.gz" "$url" || { echo "DL FAIL"; exit 1; }
ls -la "$app/.staging/dl.tar.gz"

echo "== 2. extract =="
rm -rf "$app/.staging/x"; mkdir -p "$app/.staging/x"
tar -xzf "$app/.staging/dl.tar.gz" -C "$app/.staging/x" || exit 1
bin=$(find "$app/.staging/x" -maxdepth 2 -type f -name 'sun-panel' | sed -n 1p)
webd=$(find "$app/.staging/x" -maxdepth 2 -type d -name 'web' | sed -n 1p)
echo "bin=$bin webd=$webd"
chmod +x "$bin"

echo "== 3. stop + verify port free =="
/etc/init.d/sunpanel stop
i=0
while [ $i -lt 15 ]; do
  netstat -tln 2>/dev/null | grep -q ':3002 ' || break
  sleep 1
  i=$((i + 1))
done
netstat -tln 2>/dev/null | grep 3002 && echo "STILL BOUND!" || echo "port free (waited ${i}s)"
ps | grep -v grep | grep sun-panel || echo "no sun-panel process"

echo "== 4. swap =="
[ -x "$app/sun-panel" ] && { mkdir -p "$app/releases/rollback-tmp"; mv "$app/sun-panel" "$app/web" "$app/releases/rollback-tmp/" 2>/dev/null; }
mv "$bin" "$app/sun-panel"
rm -rf "$app/web"
mv "$webd" "$app/web"
echo "$tag" > "$app/version"
ls -la "$app/sun-panel" "$app/web/index.html"

echo "== 5. start + probe =="
/etc/init.d/sunpanel start
j=0
while [ $j -lt 20 ]; do
  sleep 2
  j=$((j + 1))
  if curl -fs -m 3 "http://127.0.0.1:3002/" >/dev/null 2>&1; then
    echo "HEALTH OK at $((j * 2))s"
    break
  fi
  echo "attempt $j: no response"
  netstat -tln 2>/dev/null | grep 3002 || echo "  (not listening)"
  ps | grep -v grep | grep sun-panel || echo "  (no process)"
done
curl -fs -m 3 "http://127.0.0.1:3002/" >/dev/null 2>&1 && echo "RESULT: v2 HEALTHY" || echo "RESULT: STILL FAILING"
echo "== syslog tail =="
logread | grep -iE "sun-panel\[" | tail -n 10
