#!/bin/sh
curl -fsS -m 25 -A 'luci-app-sunpanel/1.1' "https://api.github.com/repos/hslr-s/sun-panel/releases?per_page=30" > /tmp/rels.json 2>/dev/null
echo "== all tags (recent 30) =="
grep -o '"tag_name": *"[^"]*"' /tmp/rels.json | sed 's/"tag_name": *//;s/"//g'
echo "== v2 releases and their arm64 asset names =="
grep -oE '"tag_name": *"V2[^"]*"|"name": *"sun-panel_[^"]*arm64[^"]*"' /tmp/rels.json | head -n 30
