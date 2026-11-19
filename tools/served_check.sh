#!/bin/sh
echo "== served view JS: require form count =="
curl -s -m 5 http://127.0.0.1:8080/luci-static/resources/view/sunpanel.js | grep -c "require form"
echo "== served menu title =="
cat /usr/share/luci/menu.d/luci-app-sunpanel.json
echo "== served JS first bytes =="
curl -s -m 5 http://127.0.0.1:8080/luci-static/resources/view/sunpanel.js | head -n 9
echo "== rpcd sees acl? =="
ls /usr/share/rpcd/acl.d/luci-app-sunpanel.json
