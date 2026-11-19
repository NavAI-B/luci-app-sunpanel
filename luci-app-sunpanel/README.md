# luci-app-sunpanel — Sun-Panel v2 的 OpenWrt/ImmortalWrt 管理插件

针对 Sun-Panel v1 停更、官方主推 v2 迁移的现状，为 OpenWrt/ImmortalWrt 重新设计的 LuCI 管理插件。
替换旧版手写 lua 插件（`luci-app-sunpanel 0.260323.*`），在**保留 v1 数据**的前提下完成 v1 → v2 迁移，
并负责后续版本更新与基础配置。

- 上游项目: <https://github.com/hslr-s/sun-panel>
- 官方文档: <https://doc.sun-panel.top>（v2 迁移推荐路线：v1 导出备份包 → 单独部署 v2 → 导入恢复）
- 实测环境: ImmortalWrt 25.12-SNAPSHOT · rockchip/armv8 (aarch64_generic) · apk 包管理 · LuCI (JS 渲染) · luci-base 26.126

## 功能

| 标签页 | 内容 |
|---|---|
| 服务状态 | 运行状态/模式、启停重启、打开面板入口、服务日志 |
| 基础设置 | 端口/监听地址/token 有效期、数据目录与程序目录、conf.ini 托管开关、更新通道、镜像/代理 |
| 版本管理 | GitHub 双通道检查（stable / beta）、按架构自动选包（本机 musl aarch64 → `linux_arm64`）、下载→SHA256 校验→原子切换→健康检查→**失败自动回滚**、本地版本回滚/清理、离线安装 release 包 |
| v1 迁移向导 | 检测旧版 v1 → 上传备份包 → 部署 v2 试运行（临时端口 3004）→ v2 界面导入备份 → 验证 → 切换正式端口 → 归档清理 v1 |

### 设计要点

- **overlay 友好**：apk 包（或直拷贝）只装骨架；二进制与 web 前端由版本管理器下载到数据分区（默认
  `/mnt/mmcblk0p1/sun-panel/app`），系统分区不再被大文件与版本迭代挤爆。
- **v1 兼容垫片**：v2 未安装时，init 脚本自动沿用旧 v1 二进制与配置继续服务，迁移期间面板不掉线。
- **数据零风险**：迁移全程不写 v1 数据目录；v2 使用全新数据目录，导入备份成功并验证后才切换。
- **conf.ini 托管**：UCI 为唯一配置源，启动时按 v2 实测格式渲染（含 v2 新增 `micro_app_path`）；
  `manage_conf=0` 时只生成一次，保留手工修改。
- **网络不友好环境**：支持 GitHub 加速前缀（镜像）与 HTTP 代理两种下载加速方式，另可离线安装。

## 安装（成品包，免 SDK）

在路由器上执行（假设包已上传到 `/tmp/sunpanel-installer-1.0.0.tar.gz`）：

```sh
cd /tmp
tar -xzf sunpanel-installer-1.0.0.tar.gz
cd sunpanel-installer-1.0.0
sh install.sh
```

安装脚本会自动：备份旧 UCI 配置 → 卸载旧 apk 包 → 写入新文件 → 迁移配置（修正旧版相对路径、
清除重复 section）→ 重载 rpcd → 启动服务（v1 垫片或 v2）。

卸载：`sh uninstall.sh`（保留 /etc/config/sunpanel、v2 数据目录与程序目录）。

## 安装（SDK 构建 apk/ipk）

把 `luci-app-sunpanel/` 目录放进 luci feed（`feeds/luci/applications/luci-app-sunpanel`）后正常编译。
依赖：`+luci-base +curl +ucode +ucode-mod-fs +ucode-mod-uci +rpcd +rpcd-mod-file`。
`po/` 会被 luci.mk 自动编译为 `luci-i18n-sunpanel-zh-cn` / `luci-i18n-sunpanel-en`。

> 翻译包说明：本插件源字符串即中文，`po/zh-cn` 为原文基准（po2lmo 规范会跳过译文=原文的条目，
> 属正常现象），实际翻译内容在 `po/en`（英文界面）。

## 迁移向导（v1 → v2）

1. **检测旧版 v1**：从安装时记录的 `legacy_v1_dir` 读取旧版信息。
2. **上传备份包**：先在旧 v1 网页（系统设置 → 备份恢复）导出备份 zip，再到本页上传。
3. **部署 v2 试运行**：需先在「版本管理」安装 v2（beta 通道）。向导以全新数据目录、
   临时端口 3004 启动 v2。
4. **导入备份**：打开 `http://<路由器IP>:3004/`，用默认账号 `admin@sun.cc` / `12345678` 登录，
   在 v2 界面导入刚上传的备份包（此步在 v2 网页完成，插件不经手面板凭证）。
5. **验证**：确认内容无误后点击验证。
6. **切换正式端口**：v2 回到 3002/3003 正式接管。
7. **完成清理**：归档旧 v1 二进制、清除旧插件残留（旧 v1 数据目录不动，确认无误后可自行删除）。

应急：迁移过程中或 v2 异常时，可一键「强制回到 v1」（仅限 v1 尚未清理时）。

## 目录结构

```
luci-app-sunpanel/
├── Makefile                       # luci feed 包定义
├── htdocs/.../view/sunpanel.js    # LuCI 页面（状态/设置/版本/迁移 四标签）
├── root/
│   ├── etc/config/sunpanel        # UCI 默认配置
│   ├── etc/init.d/sunpanel        # procd 服务（v2 / v1 垫片双模式）
│   ├── etc/uci-defaults/40_luci-sunpanel
│   ├── usr/libexec/sunpanel-call  # ucode 分发器（LuCI 后端）
│   ├── usr/share/luci/menu.d/…json
│   ├── usr/share/rpcd/acl.d/…json
│   └── usr/share/sunpanel/        # common.sh / confgen.sh / update.sh /
│                                  # migrate.sh / install-migrate.sh / payload-apply.sh
├── po/ (templates, zh-cn, en)     # 翻译源
├── installer/                     # 免 SDK 直拷贝安装/卸载脚本
└── tools/                         # gen_po.mjs / po2lmo.mjs / lmo_roundtrip.mjs
```

## 故障排查

- **下载 release 失败**：基础设置里配置「GitHub 加速前缀」（如 `https://ghfast.top`）或
  「下载代理」（如路由器 clash 的 `http://127.0.0.1:7890`）；也可走离线安装。
- **服务无法启动**：服务状态页查看日志；常见原因是数据目录所在分区未挂载。
- **更新失败自动回滚**：版本管理页会显示失败原因与新版本健康检查日志。
- **回到 v1**：迁移向导「应急操作 → 强制回到 v1」。

## 已知边界与注意事项

- v2 目前（2.0.2-beta*）为官方 beta/开发版，官方明确提示勿直接用于正式环境；请保持备份习惯
  （v2 界面同样支持导出备份）。
- v2 全新安装默认密码为 `admin@sun.cc / 12345678`，导入迁移完成后请及时修改。
- 成品包为直拷贝安装（ImmortalWrt apk-tools 3.0.2 暂无 mkpkg 自打包能力），文件不受 apk 跟踪，
  由 uninstall.sh 负责清理；SDK 构建的 apk 包则完全纳入包管理。
- 旧 v1 数据目录（如 `/mnt/mmcblk0p1/Configs/SunPanel`）迁移完成后仍会保留，确认 v2 一切正常后
  再手动删除。
