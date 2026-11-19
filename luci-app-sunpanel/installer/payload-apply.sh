#!/bin/sh
# luci-app-sunpanel -- copy package payload onto the router
#
# Usage: payload-apply.sh <payload-src-dir>
# The payload dir mirrors the install layout:
#   etc/... usr/... www/luci-static/resources/view/sunpanel.js
# Also stashes a self-repair tarball used by the migration "finish" step
# in case the legacy apk package still occupies colliding paths.

SRC="$1"
[ -d "$SRC" ] || { echo "payload dir missing: $SRC"; exit 2; }
[ "$(id -u)" = "0" ] || { echo "must run as root"; exit 2; }

cp_file() { # <src> <dst> <mode>
	mkdir -p "$(dirname "$2")"
	cp -f "$1" "$2"
	chmod "$3" "$2"
	sed -i 's/\r$//' "$2" 2>/dev/null
}

# init / scripts (executable)
for f in etc/init.d/sunpanel etc/uci-defaults/40_luci-sunpanel \
         usr/libexec/sunpanel-call \
         usr/share/sunpanel/common.sh usr/share/sunpanel/confgen.sh \
         usr/share/sunpanel/install-migrate.sh usr/share/sunpanel/update.sh \
         usr/share/sunpanel/migrate.sh usr/share/sunpanel/payload-apply.sh; do
	[ -f "$SRC/$f" ] && cp_file "$SRC/$f" "/$f" 755
done

# plain files
for f in etc/config/sunpanel \
         usr/share/luci/menu.d/luci-app-sunpanel.json \
         usr/share/rpcd/acl.d/luci-app-sunpanel.json \
         usr/lib/lua/luci/i18n/sunpanel.zh-cn.lmo \
         usr/lib/lua/luci/i18n/sunpanel.en.lmo \
         www/luci-static/resources/view/sunpanel.js; do
	# package default UCI config: only write when absent (keep user config)
	if [ "$f" = "etc/config/sunpanel" ] && [ -f "/$f" ]; then
		continue
	fi
	[ -f "$SRC/$f" ] && cp_file "$SRC/$f" "/$f" 644
done

# self-repair stash (everything EXCEPT etc/config/sunpanel)
mkdir -p /usr/share/sunpanel/.selfcheck
(cd "$SRC" && tar -czf /usr/share/sunpanel/.selfcheck/core.tar.gz \
	etc/init.d/sunpanel etc/uci-defaults/40_luci-sunpanel \
	usr/libexec/sunpanel-call usr/share/sunpanel \
	usr/share/luci/menu.d/luci-app-sunpanel.json \
	usr/share/rpcd/acl.d/luci-app-sunpanel.json \
	usr/lib/lua/luci/i18n/sunpanel.zh-cn.lmo \
	usr/lib/lua/luci/i18n/sunpanel.en.lmo \
	www/luci-static/resources/view/sunpanel.js 2>/dev/null) || true

# one-time config migration (old schema -> new schema)
sh /usr/share/sunpanel/install-migrate.sh || true

rm -f /tmp/luci-*cache* 2>/dev/null
echo "payload applied"
