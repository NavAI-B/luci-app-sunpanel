#!/bin/sh
# luci-app-sunpanel -- configuration setup / one-time migration
#
# Produces /etc/sunpanel.conf (KEY='value') from:
#   A. an existing /etc/sunpanel.conf   (idempotent no-op)
#   B. the retired UCI file /etc/config/sunpanel (values ported, then the
#      file is retired as untracked leftover)
#   C. sane defaults

. /usr/share/sunpanel/common.sh

CONF=/etc/sunpanel.conf

[ -f "$CONF" ] && exit 0

# ---- harvest the retired UCI config (old handwritten plugin schema or
#      first-generation apk schema) -------------------------------------
OLD_ENABLED="$(uci -q get sunpanel.sunpanel.enabled 2>/dev/null)"
OLD_PORT="$(uci -q get sunpanel.sunpanel.port 2>/dev/null)"
OLD_HTTPS="$(uci -q get sunpanel.sunpanel.https_port 2>/dev/null)"
OLD_LISTEN="$(uci -q get sunpanel.sunpanel.listen 2>/dev/null)"
OLD_TOKEN="$(uci -q get sunpanel.sunpanel.token_expires 2>/dev/null)"
OLD_DATA="$(uci -q get sunpanel.sunpanel.data_dir 2>/dev/null)"
OLD_APP="$(uci -q get sunpanel.sunpanel.app_dir 2>/dev/null)"
OLD_DOCKER="$(uci -q get sunpanel.sunpanel.docker_host 2>/dev/null)"
OLD_CHANNEL="$(uci -q get sunpanel.sunpanel.channel 2>/dev/null)"
OLD_MIRROR="$(uci -q get sunpanel.sunpanel.mirror 2>/dev/null)"
OLD_PROXY="$(uci -q get sunpanel.sunpanel.proxy 2>/dev/null)"
OLD_LEGACY="$(uci -q get sunpanel.sunpanel.legacy_v1_dir 2>/dev/null)"
OLD_PATH="$(uci -q get sunpanel.sunpanel.config_path 2>/dev/null)"

[ -n "$OLD_ENABLED" ] || OLD_ENABLED=1
[ -n "$OLD_PORT" ] || OLD_PORT=3002
[ -n "$OLD_HTTPS" ] || OLD_HTTPS=3003
[ -n "$OLD_LISTEN" ] || OLD_LISTEN=0.0.0.0
[ -n "$OLD_TOKEN" ] || OLD_TOKEN=168
[ -n "$OLD_DATA" ] || OLD_DATA=/mnt/mmcblk0p1/sun-panel/data
[ -n "$OLD_APP" ] || OLD_APP=/mnt/mmcblk0p1/sun-panel/app
[ -n "$OLD_CHANNEL" ] || OLD_CHANNEL=beta

# legacy v1 dir: harvest old UCI config_path / legacy_v1_dir, then fix
# the historical missing-leading-slash form
OLD_PATH="$OLD_LEGACY"
[ -n "$OLD_PATH" ] || OLD_PATH="$OLD_DOCKER" # never; keep var symmetrical
OLD_PATH="$(uci -q get sunpanel.sunpanel.config_path 2>/dev/null)"
if [ -z "$OLD_PATH" ]; then
	for d in /mnt/mmcblk0p1/Configs/SunPanel /mnt/sda1/Configs/SunPanel /opt/SunPanel; do
		[ -f "$d/conf.ini" ] && { OLD_PATH="$d"; break; }
	done
fi
case "$OLD_PATH" in
	/*) ;;
	/?*) OLD_PATH="/$OLD_PATH" ;;
	*) OLD_PATH="" ;;
esac
OLD_PATH="${OLD_PATH%/}"
[ -f "$OLD_PATH/conf.ini" ] || OLD_PATH=""

cat > "$CONF" <<EOF
ENABLED='$OLD_ENABLED'
PORT='$OLD_PORT'
HTTPS_PORT='$OLD_HTTPS'
LISTEN_ADDRESS='$OLD_LISTEN'
TOKEN_EXPIRES='$OLD_TOKEN'
DATA_DIR='$OLD_DATA'
APP_DIR='$OLD_APP'
DOCKER_HOST='$OLD_DOCKER'
CHANNEL='${OLD_CHANNEL:-beta}'
MIRROR=''
PROXY=''
LEGACY_V1_DIR='$OLD_PATH'
EOF

# the UCI file is retired; remove it (and any stale .apk-new) so nothing
# reads the dead schema
rm -f /etc/config/sunpanel /etc/config/sunpanel.apk-new 2>/dev/null

exit 0
