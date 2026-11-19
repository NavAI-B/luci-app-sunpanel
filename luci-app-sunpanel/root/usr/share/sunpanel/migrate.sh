#!/bin/sh
# luci-app-sunpanel -- v1 -> v2 migration wizard backend
#
# Wizard steps (driven from LuCI, each idempotent where safe):
#   detect       report legacy v1 install (dir/version/port/running)
#   deploy       fresh v2 on temp port 3004 with empty data dir
#                (user then logs into v2 with default creds and imports
#                 the uploaded v1 backup zip via the v2 web UI)
#   verify       health-check the temp instance
#   switch       move v2 back to the normal port (3002) and manage_conf=1
#   finish       archive legacy v1 binary, purge old plugin leftovers
#   abort        stop the wizard, return to v1 (force-legacy shim)
#
# State file: <state_dir>/migrate.state   Log: <state_dir>/migrate.log
# The legacy v1 DATA directory is never written to by this script.

. /usr/share/sunpanel/common.sh

STEP="$1"; shift

MSTATE="$(sp_state_dir)/migrate.state"
MLOG="$(sp_state_dir)/migrate.log"
TEMP_PORT=3004

state_set() { sp_state_set "$MSTATE" "$1" "$2"; }
state_get() { sp_state_get "$MSTATE" "$1"; }
mlog() {
	local m
	m="$(date '+%m-%d %H:%M:%S') $*"
	echo "$m" >> "$MLOG"
	sp_log "migrate: $*"
}

mig_dir() {
	printf '%s' "$(sp_data_dir)/../migration"
}

backup_zip() {
	printf '%s' "$(mig_dir)/v1-backup.zip"
}

poll_port() {
	local port="$1" i
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
		sleep 2
		curl -fs -m 3 "http://127.0.0.1:$port/" >/dev/null 2>&1 && return 0
	done
	return 1
}

# normalize + validate legacy dir (empty when absent)
legacy() {
	sp_legacy_dir
}

case "$STEP" in

detect)
	d="$(legacy)"
	if [ -z "$d" ]; then
		echo "found=0"
		exit 0
	fi
	v1ver=""
	[ -f /usr/share/sunpanel/version ] && v1ver="$(cat /usr/share/sunpanel/version)"
	v1port="$(sed -n 's/^http_port=\([0-9]*\).*/\1/p' "$d/conf.ini" | tail -n 1)"
	run=0
	pidof sun-panel >/dev/null 2>&1 && run=1
	echo "found=1"
	echo "dir=$d"
	echo "version=${v1ver:-unknown}"
	echo "port=${v1port:-3002}"
	echo "running=$run"
	echo "backup_zip=$(backup_zip)"
	[ -f "$(backup_zip)" ] && echo "backup_ready=1" || echo "backup_ready=0"
	;;

deploy)
	d="$(legacy)"
	[ -n "$d" ] || { mlog "deploy: no legacy v1 install detected"; echo "ERR no-legacy"; exit 1; }
	[ -x "$(sp_app_dir)/sun-panel" ] || { mlog "deploy: v2 not installed yet"; echo "ERR no-v2"; exit 1; }
	[ -f "$(backup_zip)" ] || { mlog "deploy: v1 backup zip not uploaded"; echo "ERR no-backup"; exit 1; }

	mkdir -p "$(sp_state_dir)"
	: > "$MLOG"
	state_set stage deploying
	state_set legacy_dir "$d"
	state_set prev_port "$(sp_port)"
	state_set temp_port "$TEMP_PORT"
	mlog "deploying fresh v2 on temp port $TEMP_PORT (legacy at $d untouched)"

	uci set sunpanel.sunpanel.manage_conf='0'
	uci commit sunpanel

	SP_CONF_PORT="$TEMP_PORT" sh /usr/share/sunpanel/confgen.sh || {
		state_set stage deploy-failed
		state_set message "confgen failed"
		exit 1
	}

	/etc/init.d/sunpanel restart >/dev/null 2>&1
	if poll_port "$TEMP_PORT"; then
		state_set stage deployed
		state_set message "v2 running on temp port $TEMP_PORT with empty data; import the backup in the v2 UI now"
		mlog "v2 temp instance is up on $TEMP_PORT"
	else
		state_set stage deploy-failed
		state_set message "v2 did not come up on $TEMP_PORT, see log"
		mlog "v2 failed to come up on $TEMP_PORT"
		exit 1
	fi
	;;

verify)
	if poll_port "$TEMP_PORT"; then
		state_set stage verified
		state_set message "temp instance healthy; you may switch over"
		mlog "verify ok on $TEMP_PORT"
	else
		state_set stage verify-failed
		state_set message "temp instance not responding on $TEMP_PORT"
		mlog "verify failed on $TEMP_PORT"
		exit 1
	fi
	;;

switch)
	[ "$(state_get stage)" = "deployed" ] || [ "$(state_get stage)" = "verified" ] || {
		mlog "switch: wizard not in deployed/verified stage"
		echo "ERR wrong-stage"
		exit 1
	}
	prev="$(state_get prev_port)"
	[ -n "$prev" ] || prev=3002
	mlog "switching v2 to port $prev"
	uci set sunpanel.sunpanel.manage_conf='1'
	uci set sunpanel.sunpanel.port="$prev"
	uci commit sunpanel
	sh /usr/share/sunpanel/confgen.sh
	/etc/init.d/sunpanel restart >/dev/null 2>&1
	if poll_port "$prev"; then
		state_set stage switched
		state_set message "v2 is now the primary panel on port $prev"
		mlog "switch complete, v2 live on $prev"
	else
		state_set stage switch-failed
		state_set message "v2 did not come up on $prev, see log"
		mlog "switch failed on $prev"
		exit 1
	fi
	;;

finish)
	[ "$(state_get stage)" = "switched" ] || {
		mlog "finish: wizard not in switched stage"
		echo "ERR wrong-stage"
		exit 1
	}
	app="$(sp_app_dir)"
	mlog "archiving legacy v1 binary"
	if [ -x /usr/sbin/sun-panel ]; then
		mkdir -p "$app/legacy-v1"
		mv /usr/sbin/sun-panel "$app/legacy-v1/sun-panel-v1-$(date +%Y%m%d%H%M%S)"
	fi

	mlog "purging old plugin leftovers"
	rm -f /usr/lib/lua/luci/controller/sunpanel.lua
	rm -rf /usr/lib/lua/luci/model/sunpanel
	rm -rf /usr/lib/lua/luci/model/cbi/sunpanel.lua
	rm -rf /usr/lib/lua/luci/view/sunpanel
	rm -f  /usr/share/sunpanel/conf.temp
	rm -f  /usr/share/sunpanel/sunpanel_conf.lua
	rm -f  /usr/share/sunpanel/sunpanel_upgrade.sh
	rm -f  /usr/share/sunpanel/version
	rm -rf /usr/share/sunpanel/web
	rm -rf /usr/share/sunpanel/conf
	rm -f  /etc/uci-defaults/sunpanel

	# if the old apk package is still registered, drop it, then restore
	# our colliding payload files from the self-repair stash (apk del
	# removes files at paths we also occupy, incl. /etc/config/sunpanel)
	if apk query --installed luci-app-sunpanel >/dev/null 2>&1; then
		mlog "old apk package still registered, removing and repairing payload"
		cp -f /etc/config/sunpanel /tmp/sunpanel-config.keep 2>/dev/null
		apk del luci-app-sunpanel >/dev/null 2>&1
		tar -xzf /usr/share/sunpanel/.selfcheck/core.tar.gz -C / 2>/dev/null
		if [ ! -f /etc/config/sunpanel ] && [ -f /tmp/sunpanel-config.keep ]; then
			mv /tmp/sunpanel-config.keep /etc/config/sunpanel
		fi
		rm -f /tmp/sunpanel-config.keep
		sh /usr/share/sunpanel/install-migrate.sh >/dev/null 2>&1
	fi

	rm -f /tmp/luci-*cache* 2>/dev/null
	state_set stage done
	state_set message "migration complete; legacy v1 files archived under $app/legacy-v1"
	mlog "migration finished"
	;;

abort)
	mlog "abort requested, restoring legacy v1 (force-legacy shim)"
	uci set sunpanel.sunpanel.manage_conf='1'
	uci commit sunpanel
	mkdir -p "$(sp_state_dir)"
	: > "$(sp_state_dir)/force-legacy"
	/etc/init.d/sunpanel restart >/dev/null 2>&1
	state_set stage aborted
	state_set message "wizard aborted; legacy v1 is serving again. Use the emergency button to return to v2 later."
	mlog "aborted; legacy shim active"
	;;

*)
	echo "usage: migrate.sh {detect|deploy|verify|switch|finish|abort}"
	exit 2
	;;
esac
