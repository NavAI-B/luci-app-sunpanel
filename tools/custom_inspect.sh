#!/bin/sh
d=/mnt/mmcblk0p1/sun-panel/data/custom
echo "== custom dir =="
ls -laR "$d" 2>/dev/null || echo "(missing)"
echo "== js/css contents =="
for f in "$d"/index.js "$d"/index.css; do
  [ -f "$f" ] && { echo "--- $f (head) ---"; head -c 500 "$f"; echo; }
done
echo "== db mentions of script/js? =="
strings /mnt/mmcblk0p1/sun-panel/data/database/database.db 2>/dev/null | grep -iE "<script|index\.js|innerHTML" | head -n 5 || echo "(none found)"
