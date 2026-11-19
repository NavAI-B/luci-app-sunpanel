#!/bin/bash
# luci-app-sunpanel -- official ImmortalWrt SDK build (runs inside WSL)
set -e
cd /root/sdkbuild

echo "===== [1/7] verify SDK ====="
echo '35d58625b40db405696f855072b1948c05d661ac1016117388b304050c901e66  sdk.tar.zst' | sha256sum -c -

echo "===== [2/7] unpack ====="
rm -rf sdk
tar --zstd -xf sdk.tar.zst
mv immortalwrt-sdk-* sdk
cd sdk

echo "===== [3/7] apk signing key pair (persisted OUTSIDE the sdk dir so it survives re-extraction) ====="
rm -f key-build key-build.pub
mkdir -p /root/sdkbuild/keys
if [ ! -f /root/sdkbuild/keys/private-key.pem ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out /root/sdkbuild/keys/private-key.pem
  openssl ec -in /root/sdkbuild/keys/private-key.pem -pubout -out /root/sdkbuild/keys/public-key.pem
  echo "generated new signing key pair"
fi
cp -f /root/sdkbuild/keys/private-key.pem /root/sdkbuild/keys/public-key.pem .
cat public-key.pem

echo "===== [3.5/7] preseed pinned base feed ====="
BASE_COMMIT=2fe3065ade26bd1ef85539c9d1bd2272bdb0aa01
if [ ! -d /root/sdkbuild/feed-base/.git ]; then
  mkdir -p /root/sdkbuild/feed-base
  cd /root/sdkbuild/feed-base
  git init -q
  git remote add origin https://github.com/immortalwrt/immortalwrt.git
  git fetch --depth 1 -q origin "$BASE_COMMIT"
  git checkout -q --detach FETCH_HEAD
  cd /root/sdkbuild/sdk
fi
echo "base feed at: $(git -C /root/sdkbuild/feed-base rev-parse HEAD)"

echo "===== [4/7] local feeds ====="
if [ ! -d /root/sdkbuild/feed-luci ]; then
  git clone --depth 1 https://github.com/immortalwrt/luci.git /root/sdkbuild/feed-luci
fi
rm -rf /root/sdkbuild/feed-luci/applications/luci-app-sunpanel
cp -r "/mnt/f/DSH Desktop/OpenWrt/Sun-Panel/luci-app-sunpanel" /root/sdkbuild/feed-luci/applications/luci-app-sunpanel

cat > feeds.conf <<'EOF'
src-cpy --root=package base /root/sdkbuild/feed-base
src-link packages /root/sdkbuild/feed-packages
src-link luci /root/sdkbuild/feed-luci
EOF

echo "===== [5/7] feeds update/install ====="
./scripts/feeds update base luci packages
./scripts/feeds install luci-app-sunpanel

echo "===== [6/7] config ====="
make defconfig >/dev/null
cat >> .config <<'EOF'
CONFIG_PACKAGE_luci-app-sunpanel=m
CONFIG_PACKAGE_luci-i18n-sunpanel-zh-cn=m
CONFIG_PACKAGE_luci-i18n-sunpanel-en=m
EOF
make defconfig >/dev/null
grep -E "luci-app-sunpanel|sunpanel" .config || echo "WARN: sunpanel not in config"

echo "===== [7/7] build ====="
make package/feeds/luci/luci-app-sunpanel/compile V=s -j"$(nproc)"

echo "===== verify signatures ====="
mkdir -p /tmp/spkeys
cp -f public-key.pem /tmp/spkeys/test.pub.pem
for a in $(find bin/packages -type f -name '*sunpanel*.apk'); do
  /root/sdkbuild/sdk/staging_dir/host/bin/apk verify --allow-untrusted --keys-dir /tmp/spkeys "$a" && echo "SIG OK: $a" || echo "SIG FAIL: $a"
done

echo "===== artifacts ====="
find bin -type f -name '*sunpanel*.apk' | xargs -r ls -la
mkdir -p /root/sdkbuild/out
find bin -type f -name '*sunpanel*.apk' -exec cp -f {} /root/sdkbuild/out/ \;
cp -f public-key.pem /root/sdkbuild/out/sunpanel-local.pub.pem
ls -la /root/sdkbuild/out/
echo BUILD_DONE
