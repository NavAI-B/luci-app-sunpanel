#!/bin/sh
# luci-app-sunpanel -- on-device installer (direct-copy mode, no SDK needed)
#
# Safe against the legacy handwritten plugin:
#   - stops the old service first, harvests old UCI values
#   - unregisters the old apk package BEFORE copying payload
#     (it owns /etc/init.d/sunpanel and /etc/config/sunpanel)
#   - keeps /usr/sbin/sun-panel and the old web dir so the v1 compat
#     shim can keep serving the panel until the migration wizard finishes
#
# Usage: ./install.sh

set -u

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD="$PKG_DIR/payload"
[ "$(id -u)" = "0" ] || { echo "请用 root 运行"; exit 2; }
[ -d "$PAYLOAD" ] || { echo "payload 目录缺失: $PAYLOAD"; exit 2; }

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "luci-app-sunpanel 安装开始"

# ---------- 1. harvest old config values ----------------------------------
OLD_PORT="$(uci -q get sunpanel.sunpanel.port 2>/dev/null || true)"
OLD_HTTPS="$(uci -q get sunpanel.sunpanel.https_port 2>/dev/null || true)"
OLD_LISTEN="$(uci -q get sunpanel.sunpanel.http_address 2>/dev/null || true)"
OLD_TOKEN="$(uci -q get sunpanel.sunpanel.token_expires 2>/dev/null || true)"
OLD_PATH="$(uci -q get sunpanel.sunpanel.config_path 2>/dev/null || true)"
OLD_ENABLED="$(uci -q get sunpanel.sunpanel.enabled 2>/dev/null || true)"

if [ -f /etc/config/sunpanel ]; then
	cp -f /etc/config/sunpanel /etc/config/sunpanel.v1bak
	say "已备份旧配置到 /etc/config/sunpanel.v1bak"
fi

# ---------- 2. stop old service -------------------------------------------
if [ -x /etc/init.d/sunpanel ]; then
	/etc/init.d/sunpanel stop >/dev/null 2>&1 || true
	say "已停止旧 sunpanel 服务"
fi

# ---------- 3. remove old apk package registration ------------------------
if apk query --installed luci-app-sunpanel >/dev/null 2>&1; then
	say "卸载旧 apk 包 luci-app-sunpanel（保留 v1 程序文件）"
	apk del luci-app-sunpanel >/dev/null 2>&1 || true
fi

# old tracked leftovers in case apk del was partial
rm -f /usr/lib/lua/luci/controller/sunpanel.lua 2>/dev/null
rm -rf /usr/lib/lua/luci/model/sunpanel /usr/lib/lua/luci/model/cbi/sunpanel.lua 2>/dev/null
rm -rf /usr/lib/lua/luci/view/sunpanel 2>/dev/null
rm -f /etc/uci-defaults/sunpanel 2>/dev/null

# restore old config if apk del took it, so migration can harvest values
if [ ! -f /etc/config/sunpanel ] && [ -f /etc/config/sunpanel.v1bak ]; then
	cp -f /etc/config/sunpanel.v1bak /etc/config/sunpanel
fi

# ---------- 4. apply new payload ------------------------------------------
say "写入新插件文件"
sh "$PKG_DIR/payload-apply.sh" "$PAYLOAD" || { echo "payload 应用失败"; exit 1; }

# ---------- 5. pre-seed legacy_v1_dir into fresh config -------------------
if [ -n "${OLD_PATH:-}" ] && ! uci -q get sunpanel.sunpanel.legacy_v1_dir >/dev/null 2>&1; then
	case "$OLD_PATH" in
		/*) LDIR="$OLD_PATH" ;;
		/?*) LDIR="/$OLD_PATH" ;;
		*) LDIR="" ;;
	esac
	LDIR="${LDIR%/}"
	[ -f "$LDIR/conf.ini" ] && {
		uci set sunpanel.sunpanel.legacy_v1_dir="$LDIR"
		uci commit sunpanel
		say "已记录 v1 数据目录: $LDIR"
	}
fi

# ---------- 6. reload rpcd (ACL) + enable service -------------------------
say "重载 rpcd（刷新 ACL）"
/etc/init.d/rpcd restart >/dev/null 2>&1 || true

say "启用并启动服务"
/etc/init.d/sunpanel enable
/etc/init.d/sunpanel start >/dev/null 2>&1 || true
sleep 3

RUNNING="$(pidof sun-panel 2>/dev/null)"
if [ -n "$RUNNING" ]; then
	say "服务已运行 (pid $RUNNING)"
else
	say "服务未运行：v2 程序尚未安装且无 v1 兼容环境。请到 LuCI → 服务 → Sun-Panel → 版本管理 安装。"
fi

cat <<'EOF'

安装完成。后续步骤：

  1. 刷新 LuCI 页面，进入 服务 -> Sun-Panel
  2. 「版本管理」标签：检查更新并安装 v2（默认 beta 通道）
     或使用「离线安装」上传本地 release 包
  3. 「v1 迁移向导」标签：按提示完成 v1 -> v2 数据迁移
  4. 迁移完成后再考虑删除 v1 数据目录（向导不会替你删除）

EOF
