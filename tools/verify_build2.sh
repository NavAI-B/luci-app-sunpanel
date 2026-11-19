#!/bin/bash
cd /root/sdkbuild/sdk
echo "== locate po2lmo =="
P=$(find staging_dir build_dir -name po2lmo -type f 2>/dev/null | head -n 1)
echo "po2lmo at: $P"
echo "== zh lmo content size =="
"$P" /root/sdkbuild/feed-luci/applications/luci-app-sunpanel/po/zh_Hans/sunpanel.po /tmp/check.zh-cn.lmo
ls -la /tmp/check.zh-cn.lmo
echo "== i18n version derivation =="
grep -n -i 'i18n.*version\|version.*i18n' feed-luci/luci.mk | head -n 6
grep -n 'LUCI_I18N_VERSION\|I18N_VERSION' feed-luci/luci.mk | head -n 6
