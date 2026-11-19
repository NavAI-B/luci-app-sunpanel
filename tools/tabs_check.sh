#!/bin/sh
echo "== initTabElements? =="
grep -c 'initTabElements' /www/luci-static/resources/ui.js
echo "== tabs APIs in ui.js =="
grep -o 'tabs[A-Za-z.]*' /www/luci-static/resources/ui.js | sort -u | head -n 10
echo "== data-tab handling in ui.js =="
grep -o 'data-tab[a-z-]*' /www/luci-static/resources/ui.js | sort -u | head -n 6
echo "== how do other views init tabs? =="
grep -rn 'initTabElements\|data-tab' /www/luci-static/resources/view/ 2>/dev/null | head -n 8
