#!/bin/sh
# luci-app-sunpanel -- uninstaller (direct-copy mode)
# Keeps: /etc/config/sunpanel, Sun-Panel data dir, program dir.

set -u

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "请用 root 运行"; exit 2; }

say "停止并禁用服务"
/etc/init.d/sunpanel stop >/dev/null 2>&1 || true
/etc/init.d/sunpanel disable >/dev/null 2>&1 || true

say "删除插件文件（数据与程序目录保留）"
rm -f  /etc/init.d/sunpanel
rm -f  /etc/uci-defaults/40_luci-sunpanel
rm -f  /usr/libexec/sunpanel-call
rm -rf /usr/share/sunpanel
rm -f  /www/luci-static/resources/view/sunpanel.js
rm -f  /usr/share/luci/menu.d/luci-app-sunpanel.json
rm -f  /usr/share/rpcd/acl.d/luci-app-sunpanel.json
rm -f  /usr/lib/lua/luci/i18n/sunpanel.zh-cn.lmo
rm -f  /usr/lib/lua/luci/i18n/sunpanel.en.lmo

/etc/init.d/rpcd restart >/dev/null 2>&1 || true
rm -f /tmp/luci-*cache* 2>/dev/null

cat <<'EOF'

已卸载 luci-app-sunpanel。

保留内容（如需彻底清理请手动删除）：
  - /etc/config/sunpanel        服务配置
  - Sun-Panel v2 数据目录        (uci: sunpanel.sunpanel.data_dir)
  - Sun-Panel v2 程序目录        (uci: sunpanel.sunpanel.app_dir)
  - /etc/config/sunpanel.v1bak   旧版 v1 配置备份（若存在）

EOF
