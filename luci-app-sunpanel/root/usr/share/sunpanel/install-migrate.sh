#!/bin/sh
# luci-app-sunpanel -- one-time /etc/config/sunpanel migration
#
# Situations handled (idempotent):
#   A. no config file        -> nothing to do (installer/uci-defaults wrote
#                               the package default beforehand)
#   B. new schema present    -> fill legacy_v1_dir if empty and a legacy
#                               install is detectable
#   C. old handwritten schema-> rewrite as new schema, carrying over
#                               enabled/port/https/listen/token_expires and
#                               the (path-fixed) config_path as legacy_v1_dir
#
# The old plugin shipped a duplicated anonymous UCI section whose
# enabled=0 broke startup via config_foreach last-wins; that junk is gone
# after the rewrite.

. /usr/share/sunpanel/common.sh

CFG="$SP_UCI_CFG"

# ---- legacy v1 dir candidates -------------------------------------------
# 1. remembered value in legacy_v1_dir
# 2. old-schema config_path option
# 3. the historical default used by the handwritten plugin
detect_legacy() {
	local d
	d="$(sp_uci legacy_v1_dir)"
	if [ -z "$d" ]; then
		d="$(uci -q get sunpanel.sunpanel.config_path 2>/dev/null)"
	fi
	if [ -z "$d" ]; then
		for d in /mnt/mmcblk0p1/Configs/SunPanel /mnt/sda1/Configs/SunPanel /opt/SunPanel; do
			[ -f "$d/conf.ini" ] && break
			d=""
		done
	fi
	[ -n "$d" ] || return 0
	case "$d" in
		/*) ;;
		*) d="/$d" ;;
	esac
	d="${d%/}"
	[ -f "$d/conf.ini" ] && printf '%s' "$d"
}

[ -f "$CFG" ] || exit 0

# new schema already installed?
if uci -q get "$CFG.sunpanel.sunpanel.app_dir" >/dev/null 2>&1; then
	LEG="$(detect_legacy)"
	if [ -n "$LEG" ] && [ -z "$(sp_uci legacy_v1_dir)" ]; then
		uci set sunpanel.sunpanel.legacy_v1_dir="$LEG"
		uci commit sunpanel
		sp_log "remembered legacy v1 dir: $LEG"
	fi
	exit 0
fi

# ---- old handwritten schema: harvest values -----------------------------
OLD_ENABLED="$(uci -q get "$CFG.sunpanel.enabled" 2>/dev/null)"
OLD_PORT="$(uci -q get "$CFG.sunpanel.port" 2>/dev/null)"
OLD_HTTPS="$(uci -q get "$CFG.sunpanel.https_port" 2>/dev/null)"
OLD_LISTEN="$(uci -q get "$CFG.sunpanel.http_address" 2>/dev/null)"
OLD_TOKEN="$(uci -q get "$CFG.sunpanel.token_expires" 2>/dev/null)"
OLD_PATH="$(uci -q get "$CFG.sunpanel.config_path" 2>/dev/null)"

[ -n "$OLD_PORT" ] || OLD_PORT=3002
[ -n "$OLD_HTTPS" ] || OLD_HTTPS=3003
[ -n "$OLD_LISTEN" ] || OLD_LISTEN=0.0.0.0
[ -n "$OLD_TOKEN" ] || OLD_TOKEN=168
[ "$OLD_ENABLED" = "0" ] || OLD_ENABLED=1

LEG="$(detect_legacy)"
[ -n "$LEG" ] || LEG="$OLD_PATH"

sp_log "migrating old sunpanel UCI schema (port=$OLD_PORT legacy=$LEG)"

uci batch <<EOF
delete sunpanel.sunpanel
set sunpanel.sunpanel=sunpanel
set sunpanel.sunpanel.enabled='$OLD_ENABLED'
set sunpanel.sunpanel.port='$OLD_PORT'
set sunpanel.sunpanel.https_port='$OLD_HTTPS'
set sunpanel.sunpanel.listen='$OLD_LISTEN'
set sunpanel.sunpanel.token_expires='$OLD_TOKEN'
set sunpanel.sunpanel.data_dir='/mnt/mmcblk0p1/sun-panel/data'
set sunpanel.sunpanel.app_dir='/mnt/mmcblk0p1/sun-panel/app'
set sunpanel.sunpanel.manage_conf='1'
set sunpanel.sunpanel.channel='beta'
set sunpanel.sunpanel.mirror=''
set sunpanel.sunpanel.proxy=''
set sunpanel.sunpanel.legacy_v1_dir='$LEG'
commit sunpanel
EOF

exit 0
