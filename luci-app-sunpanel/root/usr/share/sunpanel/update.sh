#!/bin/sh
# luci-app-sunpanel -- release updater
#
# Actions:
#   download-install <tag> <url> <sha256|->   fetch from GitHub, verify,
#                                             atomically swap, health check,
#                                             auto-rollback on failure
#   import <tarball-path>                     offline install from a
#                                             manually uploaded release file
#   rollback <version>                        switch back to a local release
#   delete <version>                          remove a stored release
#
# Progress: <state_dir>/update.state (key=value) + <state_dir>/update.log
# Environment: SP_SKIP_HEALTH=1 skips the HTTP health probe (migration)

. /usr/share/sunpanel/common.sh

ACTION="$1"; shift

STATE="$(sp_state_dir)/update.state"
ULOG="$(sp_state_dir)/update.log"

state_set() { sp_state_set "$STATE" "$1" "$2"; }
state_log() {
	local m
	m="$(date '+%m-%d %H:%M:%S') $*"
	echo "$m" >> "$ULOG"
	sp_log "$*"
}

health_ok() {
	local port="$1" i
	for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
		sleep 2
		curl -fs -m 3 "http://127.0.0.1:$port/" >/dev/null 2>&1 && return 0
	done
	return 1
}

# core install path shared by download-install / import
# $1 = staged tar.gz path, $2 = version tag
do_install() {
	local srcfile="$1" tag="$2"
	local app stg oldver rel got bin webd ok

	app="$(sp_app_dir)"
	stg="$app/.staging"
	rel="$app/releases"
	oldver="$(sp_installed_version)"
	mkdir -p "$stg" "$rel"

	state_set phase extract
	state_log "extracting"
	rm -rf "$stg/x"; mkdir -p "$stg/x"
	tar -xzf "$srcfile" -C "$stg/x" || {
		state_set phase failed; state_set message "extract failed"
		state_log "extract failed"; exit 1
	}
	bin="$(find "$stg/x" -maxdepth 2 -type f -name 'sun-panel' | sed -n 1p)"
	webd="$(find "$stg/x" -maxdepth 2 -type d -name 'web' | sed -n 1p)"
	if [ ! -x "$bin" ] || [ -z "$webd" ]; then
		state_set phase failed; state_set message "payload invalid (no binary or no web dir)"
		state_log "payload invalid"; exit 1
	fi
	chmod +x "$bin"

	state_set phase switch
	state_log "stopping service"
	/etc/init.d/sunpanel stop >/dev/null 2>&1
	sleep 1

	if [ -x "$app/sun-panel" ] && [ -n "$oldver" ]; then
		mkdir -p "$rel/$oldver"
		rm -rf "$rel/$oldver"
		mv "$app/sun-panel" "$app/web" "$rel/$oldver/" 2>/dev/null
	fi

	mv "$bin" "$app/sun-panel"
	rm -rf "$app/web"
	mv "$webd" "$app/web"
	echo "$tag" > "$app/version"
	rm -rf "$stg"

	state_log "starting service"
	/etc/init.d/sunpanel start >/dev/null 2>&1

	if [ "${SP_SKIP_HEALTH:-0}" = "1" ]; then
		state_set phase done; state_set ok 1
		state_set message "installed $tag (health check skipped)"
		state_log "install finished (health check skipped)"
		exit 0
	fi

	if health_ok "$(sp_port)"; then
		state_set phase done; state_set ok 1
		state_set message "installed $tag, service healthy"
		state_log "install finished, service healthy"
		# keep current + the single most recent previous release
		(
			cd "$rel" 2>/dev/null || exit 0
			ls -1t | grep -v -F "$tag" | tail -n +2 | while IFS= read -r d; do
				rm -rf "$rel/$d"
				state_log "pruned old release $d"
			done
		) 2>/dev/null
		exit 0
	fi

	state_log "health check failed, rolling back to ${oldver:-none}"
	/etc/init.d/sunpanel stop >/dev/null 2>&1
	rm -f "$app/sun-panel"
	rm -rf "$app/web"
	if [ -n "$oldver" ] && [ -d "$rel/$oldver" ]; then
		mv "$rel/$oldver/sun-panel" "$rel/$oldver/web" "$app/" 2>/dev/null
	fi
	/etc/init.d/sunpanel start >/dev/null 2>&1
	state_set phase failed; state_set ok 0
	state_set message "new version unhealthy, rolled back to ${oldver:-none}"
	state_log "rolled back"
	exit 1
}

mkdir -p "$(sp_state_dir)"

case "$ACTION" in

download-install)
	tag="$1"; url="$2"; sha="$3"
	[ -n "$tag" ] && [ -n "$url" ] || { echo "usage: update.sh download-install <tag> <url> <sha>"; exit 2; }

	app="$(sp_app_dir)"
	stg="$app/.staging"
	mkdir -p "$stg"
	state_clear "$STATE"
	: > "$ULOG"
	state_set phase download
	state_set version "$tag"
	state_log "downloading: $url"

	ok=0
	proxy="$(sp_uci_default proxy '')"
	mirror="$(sp_uci_default mirror '')"
	if [ -n "$proxy" ]; then
		curl -fL --retry 2 -m 900 -x "$proxy" -A 'luci-app-sunpanel/1.0' -o "$stg/dl.tar.gz" "$url" && ok=1
	else
		curl -fL --retry 2 -m 900 -A 'luci-app-sunpanel/1.0' -o "$stg/dl.tar.gz" "$url" && ok=1
	fi
	if [ "$ok" != "1" ] && [ -n "$mirror" ]; then
		state_log "direct failed, retrying via mirror $mirror"
		curl -fL --retry 2 -m 900 -A 'luci-app-sunpanel/1.0' -o "$stg/dl.tar.gz" "${mirror}/${url}" && ok=1
	fi
	if [ "$ok" != "1" ] || [ ! -s "$stg/dl.tar.gz" ]; then
		state_set phase failed; state_set message "download failed (network/mirror/proxy)"
		state_log "download failed"
		exit 1
	fi

	if [ -n "$sha" ] && [ "$sha" != "-" ]; then
		state_set phase verify
		got="$(sha256sum "$stg/dl.tar.gz" 2>/dev/null | sed -n 's/^\([^ ]*\).*/\1/p')"
		if [ "$got" != "$sha" ]; then
			state_set phase failed; state_set message "sha256 mismatch"
			state_log "sha256 mismatch: got=$got want=$sha"
			exit 1
		fi
		state_log "sha256 ok"
	fi

	do_install "$stg/dl.tar.gz" "$tag"
	;;

import)
	src="$1"
	[ -f "$src" ] || { echo "no such file: $src"; exit 2; }
	state_clear "$STATE"
	: > "$ULOG"
	state_set phase download
	state_set version "local-upload"
	app="$(sp_app_dir)"
	mkdir -p "$app/.staging"
	cp "$src" "$app/.staging/dl.tar.gz" || {
		state_set phase failed; state_set message "cannot stage upload"; exit 1
	}
	do_install "$app/.staging/dl.tar.gz" "local-$(date +%Y%m%d%H%M%S)"
	;;

rollback)
	ver="$1"
	app="$(sp_app_dir)"
	rel="$app/releases/$ver"
	STATE_ONLY=1
	[ -d "$rel" ] && [ -x "$rel/sun-panel" ] && [ -d "$rel/web" ] || {
		echo "release not found: $ver"; exit 2
	}
	state_clear "$STATE"
	: > "$ULOG"
	state_set phase switch
	state_set version "$ver"
	state_log "rolling back to $ver"
	cur="$(sp_installed_version)"
	/etc/init.d/sunpanel stop >/dev/null 2>&1
	sleep 1
	if [ -x "$app/sun-panel" ] && [ -n "$cur" ]; then
		mkdir -p "$app/releases/$cur"
		rm -rf "$app/releases/$cur"
		mv "$app/sun-panel" "$app/web" "$app/releases/$cur/" 2>/dev/null
	fi
	mv "$rel/sun-panel" "$rel/web" "$app/" 2>/dev/null
	echo "$ver" > "$app/version"
	/etc/init.d/sunpanel start >/dev/null 2>&1
	if health_ok "$(sp_port)"; then
		state_set phase done; state_set ok 1
		state_set message "rolled back to $ver, service healthy"
		state_log "rollback finished"
	else
		state_set phase failed; state_set ok 0
		state_set message "rollback done but service not healthy on port $(sp_port)"
		state_log "rollback done, health check failed"
	fi
	;;

delete)
	ver="$1"
	app="$(sp_app_dir)"
	case "$ver" in
		""|*/*|*..*) echo "bad version"; exit 2 ;;
	esac
	[ "$ver" != "$(sp_installed_version)" ] || { echo "cannot delete running version"; exit 2; }
	rm -rf "$app/releases/$ver"
	sp_log "deleted release $ver"
	echo ok
	;;

*)
	echo "usage: update.sh {download-install|import|rollback|delete} ..."
	exit 2
	;;
esac
