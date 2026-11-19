#!/bin/sh
echo "== router key =="
md5sum /etc/apk/keys/sunpanel-local.pem
echo "== router apks =="
md5sum /tmp/luci-app-sunpanel-1.0.0-r2.apk /tmp/luci-i18n-sunpanel-zh-cn-1.0.0.apk 2>/dev/null
echo "== verify r2 verbose =="
apk verify --keys-dir /etc/apk/keys /tmp/luci-app-sunpanel-1.0.0-r2.apk 2>&1
echo "== verify zh-cn (worked earlier) =="
apk verify --keys-dir /etc/apk/keys /tmp/luci-i18n-sunpanel-zh-cn-1.0.0.apk 2>&1
echo "== installed r1 still trusted? re-verify from world =="
apk list -I 2>/dev/null | grep sunpanel
