# luci-app-sunpanel — Sun-Panel v2 的 OpenWrt/ImmortalWrt 管理插件

针对 Sun-Panel v1 停更、官方主推 v2 迁移的现状，为 OpenWrt/ImmortalWrt 重新设计的 LuCI 管理插件。
在保留 v1 数据的前提下完成 v1 → v2 迁移，并负责后续版本更新、基础配置与远程 Docker 管理。

- 上游项目: <https://github.com/hslr-s/sun-panel>
- 官方文档: <https://doc.sun-panel.top>（v2 迁移推荐路线：v1 导出备份包 → 单独部署 v2 → 导入恢复）
- 实测环境: ImmortalWrt 25.12-SNAPSHOT · rockchip/armv8 (aarch64_generic) · apk 包管理 · LuCI (JS 渲染) · luci-base 26.126

## 功能

三个标签页：

| 标签页 | 内容 |
|---|---|
| 服务状态 | 运行状态（文字色区分）、已安装版本、监听端口、开机自启、目录信息、打开面板入口 |
| 基础设置 | 启用服务（启停总开关）、端口/监听地址/token 有效期、数据目录、conf.ini 托管开关、Docker 主机 |
| 版本管理 | 发布源配置（程序目录/更新通道 V1·V2/GitHub 加速前缀/下载代理）、版本下拉可选装任意已发布版本、按架构自动选包、下载→SHA256 校验→原子切换→健康检查→**失败自动回滚** |

### 设计要点

- **overlay 友好**：apk 包只装骨架；二进制与 web 前端由版本管理器下载到数据分区（默认
  `/mnt/mmcblk0p1/sun-panel/app`），系统分区不再被大文件与版本迭代挤爆。
- **v1 兼容垫片**：v2 未安装时，init 脚本自动沿用旧 v1 二进制与配置继续服务，装 v2 期间面板不掉线。
- **数据零风险**：v2 使用全新数据目录；v1 数据目录全程只读，确认 v2 正常后可自行删除。
- **conf.ini 托管**：UCI 为唯一配置源，启动时按 v2 实测格式渲染（含 v2 新增 `micro_app_path`）；
  `manage_conf=0` 时只生成一次，保留手工修改。
- **网络不友好环境**：支持 GitHub 加速前缀（镜像）与 HTTP 代理两种下载加速方式。
- **远程 Docker 管理**：v2 内置的 Docker 管理器通过标准 Docker 客户端支持 `DOCKER_HOST`——
  在基础设置里填 `tcp://NAS_IP:2375` 即可管理 NAS 上的容器，路由器无需安装 docker。
  NAS 侧推荐配一个 docker-socket-proxy 容器白名单放行（见下方迁移一节的环境变量清单）。

### 版本检测说明

版本列表直接与 GitHub Releases 对齐，按**大版本线**分组：

- **V2 渠道**：全部 `v2.*` release（当前为 v2.0.2-beta.5 与 V2.0.2-beta26111701）
- **V1 渠道**：全部 v1.x 正式版（v1.3.0 → v1.8.1 共 10 个）

资产匹配按文件名模式（`sun-panel_*_linux_<架构>.tar.gz`）而非 tag 精确对照——上游连
tag 与资产文件的命名都对不上（release v2.0.2-beta.5 内的资产叫 beta261118）也能正确识别。
更早的 v2 beta（260912/261101/261110 等）官方未发布到 GitHub（走网盘分发），不在可检测范围。

### v1 → v2 迁移（手动，两分钟）

1. 打开旧 v1 面板（系统设置 → 备份恢复），导出备份 zip 到本机
2. LuCI 版本管理 → 通道切到「V2」→ 安装最新 v2（服务自动切换，端口沿用 3002）
3. 打开 v2 面板（默认账号 `admin@sun.cc` / `12345678`），在其「系统设置 → 备份恢复」导入备份 zip
4. 确认 v2 正常后清理 v1 残留：

```sh
rm -f /usr/sbin/sun-panel                    # v1 二进制（删后无法回退 v1）
rm -rf /usr/share/sunpanel                   # v1 web 残留（插件脚本目录，会一起删掉）
rm -rf /mnt/mmcblk0p1/Configs/SunPanel       # v1 数据目录（含旧数据库/上传文件）
rm -f /etc/config/sunpanel.v1bak             # v1 配置备份
```

注意：`/usr/share/sunpanel` 在新版插件下同时是**插件脚本目录**，上面的 `rm -rf` 会把它整个删掉，
删完需重新安装一次本插件 apk（或在迁移完成前跳过这条，仅删除其中 `web` 等旧文件）。

## 安装（apk 包，LuCI 软件包界面上传）

产物为两个标准 apk 包（ImmortalWrt SDK 构建、prime256v1 签名）：

- `luci-app-sunpanel_1.0.0-<release>_all.apk` — 本体（服务 + LuCI 页面）
- `luci-i18n-sunpanel-zh-cn_1.0.x_all.apk` — 简体中文翻译包

**第一次安装前，先信任签名公钥**（只需一次，之后升级无需再做）：

```sh
scp dist/sunpanel-local.pub.pem root@192.168.2.1:/etc/apk/keys/sunpanel-local.pem
```

然后在 LuCI → 系统 → 软件包 → 上传软件包，依次安装两个 apk（先本体后翻译，
或直接都传，apk 会按依赖排序），最后刷新页面即可在「服务」菜单看到 Sun-Panel。

命令行等价操作：

```sh
apk add ./luci-app-sunpanel_1.0.0-r16.apk
apk add ./luci-i18n-sunpanel-zh-cn_1.0.6.apk
```

卸载：LuCI 软件包列表中移除，或 `apk del luci-i18n-sunpanel-zh-cn luci-app-sunpanel`。
配置 `/etc/config/sunpanel` 与数据、程序目录默认保留。

## 构建（ImmortalWrt SDK，WSL 实测）

严格按第三方包规范：包源码放入 luci feed（`feeds/luci/applications/luci-app-sunpanel`），
`po/` 由 luci.mk 自动编译为 `luci-i18n-sunpanel-zh-cn`。

WSL Ubuntu 22.04 内一键复现（详见 `tools/build_in_wsl.sh`）：

```sh
# 1. 下载对应 SDK（本机目标 rockchip/armv8）
curl -LO https://mirror.nju.edu.cn/immortalwrt/snapshots/targets/rockchip/armv8/ \
     immortalwrt-sdk-rockchip-armv8_gcc-14.4.0_musl.Linux-x86_64.tar.zst
# 2. 解包后克隆 luci feed，把本包放进 applications/
# 3. feeds.conf 里保留 SDK 默认的 base feed 行（系统包 ucode/rpcd/libubox 等来源，
#    缺失会导致 lucihttp/cgi-io/ucode-mod-html 等依赖编译失败）
# 4. 生成 prime256v1 签名密钥对 private-key.pem / public-key.pem（rules.mk 约定），
#    密钥目录在 SDK 外持久化，避免重复构建时换钥导致已发包全部失效
# 5. ./scripts/feeds update && install && make package/feeds/luci/luci-app-sunpanel/compile
```

注意：luci 构建体系只认 `po/<规范语言目录>`（如 `zh_Hans`），因此 UI 源串为英文、
`po/zh_Hans/sunpanel.po` 承载中文翻译——这是上游 luci 应用的标准形态；
`tools/gen_po.mjs` 负责维护这套映射（`rewrite` 模式把 JS 源串切换为英文）。

## 目录结构

```
luci-app-sunpanel/
├── Makefile                       # luci feed 包定义（luci.mk，自动产出 i18n 子包）
├── htdocs/.../view/sunpanel.js    # LuCI 页面（状态/设置/版本 三标签）
├── root/
│   ├── etc/config/sunpanel        # UCI 默认配置（含 docker_host）
│   ├── etc/init.d/sunpanel        # procd 服务（v2 / v1 垫片双模式 + DOCKER_HOST 注入）
│   ├── etc/uci-defaults/40_luci-sunpanel
│   ├── usr/libexec/sunpanel-call  # ucode 分发器（LuCI 后端）
│   ├── usr/share/luci/menu.d/…json
│   ├── usr/share/rpcd/acl.d/…json
│   └── usr/share/sunpanel/        # common.sh / confgen.sh / update.sh / install-migrate.sh
├── po/ (templates, zh_Hans)       # 翻译源（英文源串 + 中文翻译）
└── tools/                         # gen_po.mjs / build_in_wsl.sh / 诊断脚本
```

产物（`bin/packages/aarch64_generic/luci/`）：
`luci-app-sunpanel_1.0.0-<release>_all.apk`、`luci-i18n-sunpanel-zh-cn_<ver>_all.apk`、
签名公钥 `public-key.pem`（即 `dist/sunpanel-local.pub.pem`）。

## 故障排查

- **上传安装报签名/UNTRUSTED 错误**：`/etc/apk/keys/` 里还没有 `sunpanel-local.pem`
  公钥，按「安装」一节的 scp 命令放一次即可。
- **下载 release 失败**：版本管理页「发布源」里配置「GitHub 加速前缀」（如 `https://ghfast.top`）或
  「下载代理」（如路由器 clash 的 `http://127.0.0.1:7890`）。
- **Docker 卡片不出现 / 列不出容器**：检查「Docker 主机」是否填写、NAS 侧 API 是否放行
  （docker-socket-proxy 的环境变量白名单）、来源 IP 是否被 NAS 防火墙/自动封锁拦截。
- **服务无法启动**：服务状态页查看日志；常见原因是数据目录所在分区未挂载。
- **更新失败自动回滚**：失败原因与健康检查日志会以通知形式弹出。
- **升级插件后页面异常**：LuCI 会话内缓存视图模块，强刷（Ctrl+Shift+R）或退出重登即可。
- **回到 v1**：只要未删除 `/usr/sbin/sun-panel` 与旧数据目录，卸载新 apk
  （`apk del luci-app-sunpanel`，旧配置备份在 `/etc/config/sunpanel.v1bak`）并恢复旧 init 即可；
  正常情况用不到。

## 已知边界与注意事项

- v2 目前（2.0.2-beta*）为官方 beta/开发版，官方明确提示勿直接用于正式环境；请保持备份习惯
  （v2 界面同样支持导出备份）。
- v2 全新安装默认密码为 `admin@sun.cc / 12345678`，导入迁移完成后请及时修改。
- 更早的 v2 beta（260912/261101/261110 等）官方未发布到 GitHub，无法通过版本管理安装；
  当前可安装的 V2 版本以「检查更新」实际返回为准。
- 旧 v1 数据目录（如 `/mnt/mmcblk0p1/Configs/SunPanel`）迁移完成后仍会保留，确认 v2 一切正常后
  再手动删除。
