#!/bin/sh
grep -o 'require \[a-z0-9/_-]*[^)]\{0,100\}' /www/luci-static/resources/luci.js | head -n 4
echo ---
grep -oE 'match\(src[^)]*\)' /www/luci-static/resources/luci.js | head -n 4
echo ---
grep -oE "'require [a-z0-9/_-]+';?[^']{0,40}" /www/luci-static/resources/luci.js | head -n 6
