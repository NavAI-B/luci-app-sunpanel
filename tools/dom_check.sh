#!/bin/sh
grep -n -o 'for(var key in attr){[^}]*}' /www/luci-static/resources/dom.js | head -n 2
echo ---
grep -n 'attr\[key\]\|val == null\|== null' /www/luci-static/resources/dom.js | head -n 5
