# -*- coding: utf-8 -*-
# insert two EN_MAP entries into gen_po.mjs after the 保存中… line
import io

path = '/mnt/f/DSH Desktop/OpenWrt/Sun-Panel/luci-app-sunpanel/tools/gen_po.mjs'
with io.open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

anchor = None
for i, line in enumerate(lines):
    if '保存中…' in line and 'Saving' in line:
        anchor = i
        break
if anchor is None:
    raise SystemExit('anchor not found')

new_entries = [
    "  'Docker 主机': 'Docker host',\n",
    "  '留空使用本机 /var/run/docker.sock，例如 tcp://192.168.2.9:2375': 'Empty for local /var/run/docker.sock, e.g. tcp://192.168.2.9:2375',\n",
]
# avoid double-insert
joined = ''.join(lines)
if 'Docker 主机' in joined:
    print('already inserted')
else:
    lines[anchor + 1:anchor + 1] = new_entries
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.writelines(lines)
    print('inserted 2 entries after line', anchor + 1)
