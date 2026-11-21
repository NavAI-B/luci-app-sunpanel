# luci-app-sunpanel — 在 OpenWrt 上原生运行 Sun-Panel v2

将 [Sun-Panel](https://github.com/hslr-s/sun-panel) v2 以**原生二进制**方式部署在
OpenWrt/ImmortalWrt 上，并提供 LuCI 管理界面：服务启停、版本更新（对齐 GitHub Releases）、
基础配置，以及**远程 Docker 主机**接入——路由器上无需安装 Docker，也能管理 NAS 上的容器。

- 上游项目: <https://github.com/hslr-s/sun-panel>
- 官方文档: <https://doc.sun-panel.top>
- 实测环境: ImmortalWrt 25.12-SNAPSHOT · rockchip/armv8 (aarch64_generic) · apk 包管理 · LuCI (JS 渲染) · luci-base 26.126
- 适配最低需求: 任意能跑 aarch64/armv7/x86_64 musl 的 OpenWrt 设备，约 40MB 可写空间（数据分区更佳）

## 为什么不用 Docker 部署

Sun-Panel 官方主推 Docker 部署，但在路由器上再套一层 Docker 意味着：占用更大的存储与内存、
依赖 overlay 扩容、与 OpenWrt 的网络栈互相纠缠。本项目把 Sun-Panel v2 的官方二进制直接跑在
procd 下：单进程、开机自启、崩溃自动拉起，资源占用与维护成本都最小。

如果你更习惯 Docker 部署 Sun-Panel 本体，本项目同样兼容——只是它的定位是「路由器上不要 Docker」。

## 功能

三个标签页：

| 标签页 | 内容 |
|---|---|
| 服务状态 | 运行状态（文字色区分）、已安装版本、监听端口、开机自启、目录信息、打开面板入口 |
| 基础设置 | 启用服务（启停总开关）、端口/监听地址/token 有效期、数据目录、conf.ini 托管开关、Docker 主机 |
| 版本管理 | 发布源配置（程序目录/更新通道 V1·V2/GitHub 加速前缀/下载代理）、版本下拉可选装任意已发布版本、按架构自动选包、下载→SHA256 校验→原子切换→健康检查→**失败自动回滚** |

### 设计要点

- **overlay 友好**：apk 包只装骨架；Sun-Panel 二进制与 web 前端由版本管理器下载到数据分区
  （默认 `/mnt/mmcblk0p1/sun-panel/app`），系统分区不再被大文件与版本迭代挤爆。
- **Release 对齐**：版本列表直接与 GitHub Releases 同步，按大版本线分组（V1 / V2），
  资产匹配按文件名模式而非 tag 精确对照——上游连 tag 与资产文件的命名都对不上也能正确识别。
- **conf.ini 托管**：UCI 为唯一配置源，启动时按 v2 实测格式渲染（含 v2 新增 `micro_app_path`）；
  `manage_conf=0` 时只生成一次，保留手工修改。
- **远程 Docker 管理**：v2 的 Docker 管理器走标准 Docker Go 客户端，尊重 `DOCKER_HOST`——
  在基础设置里填 `tcp://NAS_IP:2375` 即可管理 NAS 上的容器，路由器无需安装 Docker（见下文）。
- **网络不友好环境**：支持 GitHub 加速前缀（镜像）与 HTTP 代理两种下载加速方式。

## 安装

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

## 快速开始（全新安装）

1. 服务状态页确认服务运行（首次安装只有骨架，还没有 Sun-Panel 本体）
2. 版本管理 → 更新通道切到「V2」→ 检查更新 → 选择最新版本 → 更新版本
   （自动下载 ~19MB 到数据分区、SHA256 校验、原子切换、健康检查；失败自动回滚）
3. 网络不好时先在基础设置里配「GitHub 加速前缀」（如 `https://ghfast.top`）或「下载代理」，
   或用「离线安装」上传本地下载好的 release 包
4. 打开面板，用 v2 首次启动的账号登录（默认 `admin@sun.cc` / `12345678`），**立即修改密码**
5. 基础设置里按需调整端口/数据目录；有 NAS Docker 的填「Docker 主机」启用容器管理

## 远程 Docker 管理（管理 NAS 上的容器）

v2 内置的 Docker 管理器通过标准 Docker 客户端工作，尊重 `DOCKER_HOST` 环境变量。
在基础设置里把「Docker 主机」填成 NAS 的 Docker API 地址（如 `tcp://192.168.2.9:2375`），
保存并重启后，v2 界面的 Docker 卡片即可列出并控制 NAS 上的容器。

NAS 侧需要把 Docker API 暴露为 TCP。推荐在 NAS 的 Docker 管理界面里部署
**docker-socket-proxy** 容器——白名单放行，不暴露高危接口：

```yaml
services:
  docker-socket-proxy:
    image: tecnativa/docker-socket-proxy
    container_name: docker-socket-proxy
    restart: unless-stopped
    ports:
      - "2375:2375"
    environment:
      - CONTAINERS=1        # 查看/列出容器
      - IMAGES=1            # 查看镜像
      - INFO=1
      - PING=1
      - VERSION=1
      - ALLOW_START=1       # 启动容器
      - ALLOW_STOP=1        # 停止容器
      - ALLOW_RESTARTS=1    # 重启容器
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

这套白名单只包含列出/查看容器、启动/停止/重启——**不包含**创建、删除容器或镜像、
执行命令（exec）等高危操作。需要容器终端再加 `EXEC=1`。

> 也可以直接让 NAS 的 dockerd 监听 TCP（daemon.json 加 `"hosts"`），但没有白名单过滤，
> 仅建议在完全可信的内网使用。

## 从 v1 二进制部署迁移（附录）

之前用 v1.8.x 二进制直接跑在路由器上的用户，迁移到 v2 只需三步：

1. 打开旧 v1 面板（系统设置 → 备份恢复），导出备份 zip 到本机
2. 版本管理 → 通道切到「V2」→ 安装最新 v2（服务自动切换，端口沿用 3002）
3. 打开 v2 面板，在其「系统设置 → 备份恢复」导入备份 zip

v2 使用全新数据目录，旧 v1 的数据目录全程只读；确认 v2 正常后清理残留：

```sh
rm -f /usr/sbin/sun-panel                    # v1 二进制（删后无法回退 v1）
rm -rf /usr/share/sunpanel                   # v1 web 残留
rm -rf /mnt/mmcblk0p1/Configs/SunPanel       # v1 数据目录（含旧数据库/上传文件）
rm -f /etc/config/sunpanel.v1bak             # v1 配置备份（若有）
```

## 构建（ImmortalWrt SDK，WSL 实测）

严格按第三方包规范：包源码放入 luci feed（`feeds/luci/applications/luci-app-sunpanel`），
`po/` 由 luci.mk 自动编译为 `luci-i18n-sunpanel-zh-cn`。

WSL Ubuntu 22.04 内一键复现（详见 `tools/build_in_wsl.sh`）：

```sh
# 1. 下载对应 SDK（以 rockchip/armv8 为例，按你的目标架构替换）
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

产物（`bin/packages/<arch>/luci/`）：
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
- v2 全新安装默认密码为 `admin@sun.cc / 12345678`，首次登录后请及时修改。
- 更早的 v2 beta（260912/261101/261110 等）官方未发布到 GitHub，无法通过版本管理安装；
  当前可安装的 V2 版本以「检查更新」实际返回为准。
- 旧 v1 数据目录迁移完成后仍会保留，确认 v2 一切正常后再手动删除。
