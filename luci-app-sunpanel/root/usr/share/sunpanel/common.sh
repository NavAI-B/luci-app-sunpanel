#!/bin/sh
# luci-app-sunpanel -- shared helpers
# Sourced by: /etc/init.d/sunpanel, confgen.sh, update.sh,
#              install-migrate.sh
#
# Configuration storage: /etc/sunpanel.conf (KEY='value' shell-sourceable).
# UCI is no longer used at runtime.

SP_CONF=/etc/sunpanel.conf
SP_SHARE=/usr/share/sunpanel

sp_log() {
	logger -t luci-app-sunpanel "$*"
}

# read KEY from the plugin config file (empty if unset)
sp_conf() {
	local v
	v="$(sed -n "s/^${1}='\\(.*\\)'$/\\1/p" "$SP_CONF" 2>/dev/null | tail -n 1)"
	printf '%s' "$v"
}

# read KEY with fallback default
sp_conf_default() {
	local v
	v="$(sp_conf "$1")"
	if [ -n "$v" ]; then
		printf '%s' "$v"
	else
		printf '%s' "$2"
	fi
}

sp_app_dir() {
	sp_conf_default APP_DIR "/mnt/mmcblk0p1/sun-panel/app"
}

sp_data_dir() {
	sp_conf_default DATA_DIR "/mnt/mmcblk0p1/sun-panel/data"
}

sp_state_dir() {
	printf '%s' "$(sp_app_dir)/.state"
}

sp_port() {
	sp_conf_default PORT 3002
}

# absolute-normalized legacy v1 configuration directory (empty when none)
sp_legacy_dir() {
	local d
	d="$(sp_conf LEGACY_V1_DIR)"
	[ -n "$d" ] || return 0
	case "$d" in
		/*) ;;
		*) d="/$d" ;;
	esac
	d="${d%/}"
	[ -f "$d/conf.ini" ] && printf '%s' "$d"
}

# installed v2 version string (empty if not installed)
sp_installed_version() {
	local v
	v="$(cat "$(sp_app_dir)/version" 2>/dev/null)"
	[ -n "$v" ] && printf '%s' "$v"
}

# state file helpers: key=value single-line records
sp_state_get() {
	local f="$1" k="$2" line
	[ -f "$f" ] || return 0
	line="$(sed -n "s/^${k}=//p" "$f" | tail -n 1)"
	printf '%s' "$line"
}

sp_state_set() {
	local f="$1" k="$2" v="$3"
	touch "$f" || return 1
	sed -i "s/^${k}=.*$//" "$f" 2>/dev/null
	sed -i '/^$/d' "$f" 2>/dev/null
	printf '%s=%s\n' "$k" "$v" >> "$f"
}

sp_state_clear() {
	local f="$1"
	: > "$f" 2>/dev/null
}

# strip CR (files may have been edited on Windows) and chmod helper
sp_clean_script() {
	[ -f "$1" ] || return 1
	sed -i 's/\r$//' "$1" 2>/dev/null || true
	chmod +x "$1" 2>/dev/null || true
}
