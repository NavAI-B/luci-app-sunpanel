#!/bin/sh
# luci-app-sunpanel -- shared helpers
# Sourced by: /etc/init.d/sunpanel, confgen.sh, update.sh, migrate.sh,
#              install-migrate.sh

SP_UCI_CFG=/etc/config/sunpanel
SP_SHARE=/usr/share/sunpanel

sp_log() {
	logger -t luci-app-sunpanel "$*"
}

# read option from the named UCI section (empty if unset)
sp_uci() {
	uci -q get "sunpanel.sunpanel.$1" 2>/dev/null
}

# read option with fallback default
sp_uci_default() {
	local v
	v="$(sp_uci "$1")"
	if [ -n "$v" ]; then
		printf '%s' "$v"
	else
		printf '%s' "$2"
	fi
}

sp_app_dir() {
	sp_uci_default app_dir "/mnt/mmcblk0p1/sun-panel/app"
}

sp_data_dir() {
	sp_uci_default data_dir "/mnt/mmcblk0p1/sun-panel/data"
}

sp_state_dir() {
	printf '%s' "$(sp_app_dir)/.state"
}

sp_port() {
	sp_uci_default port 3002
}

# absolute-normalized legacy v1 configuration directory (empty when none)
# - installer stores it in option legacy_v1_dir
# - tolerates the historical missing-leading-slash form ("mnt/xx" -> "/mnt/xx")
sp_legacy_dir() {
	local d
	d="$(sp_uci legacy_v1_dir)"
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
