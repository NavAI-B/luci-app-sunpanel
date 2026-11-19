#!/bin/sh
# luci-app-sunpanel -- render Sun-Panel conf/conf.ini from UCI
#
# Format mirrors byte-for-byte what the v2 binary generates via
# `-config-reset` (verified against 2.0.2-beta26111701), with all paths
# pinned to absolute locations under data_dir/app_dir.
#
# Environment overrides:
#   SP_CONF_PORT   override [base] http_port (migration wizard temp port)

. /usr/share/sunpanel/common.sh

data_dir="$(sp_data_dir)"
app_dir="$(sp_app_dir)"
port="${SP_CONF_PORT:-$(sp_uci_default port 3002)}"
https_port="$(sp_uci_default https_port 3003)"
listen="$(sp_uci_default listen 0.0.0.0)"
token_expires="$(sp_uci_default token_expires 168)"
cert_path="$(sp_uci cert_path)"
key_path="$(sp_uci key_path)"

[ "$data_dir" != "" ] || { sp_log "confgen: data_dir empty"; exit 1; }
mkdir -p "$data_dir" || { sp_log "confgen: cannot create $data_dir"; exit 1; }

mkdir -p "$data_dir/conf" "$data_dir/database" "$data_dir/uploads" \
	"$data_dir/runtime/temp" "$data_dir/custom" "$data_dir/micro_app"

cat > "$data_dir/conf/conf.ini" <<EOF
# ======================
# Basic configuration
# ======================
# Rendered by luci-app-sunpanel confgen.sh -- do not edit while manage_conf=1
[base]
# Web run port. Default:3002
http_port=$port
# Web run https port. Default:3003
# This port is enabled only after you configure the [cert] certificate path
https_port=$https_port
# Web run address Default: 0.0.0.0
http_address=$listen
# Database driver [mysql/sqlite(Default)]
database_drive=sqlite
# Cache driver [redis/memory(Default)]
cache_drive=memory
# Queue driver [redis/memory(Default)]
queue_drive=memory
# Uploaded files
source_path=$data_dir/uploads
# Temporary file cache path.
source_temp_path=$data_dir/runtime/temp
# Front-end path.
web_path=$app_dir/web
# Micro App path.
micro_app_path=$data_dir/micro_app
# Custom JS and CSS. Need to create index.css, index.js.
custom_style_path=$data_dir/custom
# Token expires (hour). Default 168 (hour)
token_expires=$token_expires

# ==============================
# SSL certificate configuration
# ==============================
[cert]
# Certificate file path
cert_path=$cert_path
# Certificate private key file path
key_path=$key_path

# ======================
# Mysql database driver
# ======================
[mysql]
host=127.0.0.1
port=3306
username=root
password=root
db_name=sun_panel
wait_timeout=100

# ======================
# sqlite database driver
# ======================
[sqlite]
file_path=$data_dir/database/database.db

# ======================
# redis database driver
# ======================
[redis]
address=127.0.0.1:6379
password=
prefix=sun_panel:
db=0
EOF

sp_log "conf.ini rendered at $data_dir/conf/conf.ini (port $port)"
