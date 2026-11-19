#!/bin/bash
set -e
cd /root/sdkbuild/sdk
echo "== artifacts =="
ls -la bin/packages/aarch64_generic/luci/ || true
echo "== sig verify (with our public key) =="
mkdir -p /tmp/spkeys
cp -f public-key.pem /tmp/spkeys/t.pem
for a in bin/packages/aarch64_generic/luci/*sunpanel*.apk; do
  if staging_dir/host/bin/apk verify --keys-dir /tmp/spkeys "$a"; then
    echo "SIG OK: $a"
  else
    echo "SIG FAIL: $a"
  fi
done
echo "== zh lmo content size =="
staging_dir/host/bin/po2lmo /root/sdkbuild/feed-luci/applications/luci-app-sunpanel/po/zh_Hans/sunpanel.po /tmp/check.zh-cn.lmo
ls -la /tmp/check.zh-cn.lmo
echo "== i18n version derivation in luci.mk =="
grep -n 'I18N' feed-luci/luci.mk | head -n 10
