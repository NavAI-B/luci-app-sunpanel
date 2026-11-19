// gen_po.mjs -- generate .pot, zh-cn (identity) and en .po files from the
// LuCI view source. English translations are authored in EN_MAP below.
//
// Usage: node tools/gen_po.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewSrc = fs.readFileSync(
  path.join(root, 'htdocs/luci-static/resources/view/sunpanel.js'), 'utf8');

const re = /_\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
const ids = new Set();
let m;
while ((m = re.exec(viewSrc)) !== null) ids.add(m[1].replace(/\\'/g, "'"));
const list = [...ids].sort();

const EN_MAP = {
  '调度器调用失败': 'Dispatcher call failed',
  '正在下载': 'Downloading',
  '正在校验 SHA256': 'Verifying SHA256',
  '正在解包': 'Extracting',
  '正在切换版本': 'Switching version',
  '完成': 'Done',
  '失败': 'Failed',
  '正在部署 v2 试运行实例': 'Deploying v2 test instance',
  'v2 试运行中，请在 v2 界面导入备份': 'v2 test instance running, import the backup in the v2 UI now',
  '试运行验证通过': 'Test instance verified',
  'v2 已切换为正式实例': 'v2 switched to the primary instance',
  '部署失败': 'Deployment failed',
  '验证失败': 'Verification failed',
  '切换失败': 'Switch failed',
  '已中止，v1 已恢复服务': 'Aborted, v1 is serving again',
  '迁移完成': 'Migration complete',
  '服务状态': 'Service status',
  '基础设置': 'Basic settings',
  '版本管理': 'Version manager',
  'v1 迁移向导': 'v1 migration wizard',
  '加载中…': 'Loading…',
  '运行状态': 'Status',
  '（空）': '(empty)',
  '刷新服务日志': 'Refresh service log',
  '服务日志': 'Service log',
  '迁移按官方推荐路线执行：v1 导出备份包 → 全新部署 v2 试运行 → 在 v2 界面导入备份 → 确认无误后切换正式端口。整个过程中 v1 的数据目录只读不动。':
    'Migration follows the officially recommended path: export a v1 backup, deploy a fresh v2 test instance, import the backup in the v2 UI, then switch to the production port after verification. The v1 data directory stays read-only throughout.',
  'v2 正式运行': 'v2 running',
  'v1 兼容模式（等待迁移）': 'v1 compat mode (pending migration)',
  'v1 强制模式（应急回退）': 'v1 forced mode (emergency fallback)',
  '未安装': 'Not installed',
  '打开面板': 'Open panel',
  '运行中': 'Running',
  '已停止': 'Stopped',
  '运行模式': 'Mode',
  '已安装版本': 'Installed version',
  '监听端口': 'Listen port',
  '开机自启': 'Autostart',
  '是': 'Yes',
  '否': 'No',
  '程序目录': 'Program directory',
  '数据目录': 'Data directory',
  'Sun-Panel 基础配置': 'Sun-Panel basic configuration',
  '全局设置': 'Global settings',
  '启用服务': 'Enable service',
  'HTTP 端口': 'HTTP port',
  'HTTPS 端口': 'HTTPS port',
  '监听地址': 'Listen address',
  'Token 有效期（小时）': 'Token lifetime (hours)',
  '包含 conf / database / uploads / runtime / custom / micro_app，建议放在大容量分区':
    'Contains conf / database / uploads / runtime / custom / micro_app; keep it on a large partition',
  'sun-panel 主程序与 web 前端所在目录，由版本管理功能维护':
    'Directory holding the sun-panel binary and web assets, managed by the version manager',
  '由 LuCI 管理 conf.ini': 'Manage conf.ini from LuCI',
  '开启后每次启动按上方配置重新生成 conf/conf.ini；关闭则仅首次生成，保留手工修改':
    'When enabled, conf/conf.ini is regenerated from these options at every service start; when disabled it is only created once and manual edits survive',
  '更新通道': 'Update channel',
  '稳定版（正式 release）': 'Stable (official releases)',
  '测试版（v2 beta 预发布）': 'Beta (v2 pre-releases)',
  '当前 v2 正式版尚未发布，跟随 v2 需选择测试版通道': 'No stable v2 release exists yet; choose beta to follow v2',
  'GitHub 加速前缀': 'GitHub mirror prefix',
  '留空直连，例如 https://ghfast.top': 'Empty for direct connection, e.g. https://ghfast.top',
  '下载 release 资产失败时可配置加速站前缀': 'Configure a mirror prefix when release downloads fail',
  '下载代理': 'Download proxy',
  '留空不使用，例如 http://127.0.0.1:7890': 'Empty to disable, e.g. http://127.0.0.1:7890',
  '保存并应用后，若修改了端口等参数需重启服务才能生效。': 'After Save & Apply a service restart is required for port changes to take effect.',
  '重启服务': 'Restart service',
  'conf.ini 渲染失败': 'conf.ini rendering failed',
  '配置已渲染，服务已重启': 'Configuration rendered, service restarted',
  '操作失败：%s': 'Operation failed: %s',
  '检查更新': 'Check for updates',
  '当前版本：%s': 'Current version: %s',
  '架构：%s': 'Architecture: %s',
  '通道：%s': 'Channel: %s',
  '测试版': 'Beta',
  '稳定版': 'Stable',
  '检查失败：%s': 'Check failed: %s',
  '检查 GitHub 最新版本': 'Check latest GitHub releases',
  '离线安装': 'Offline install',
  '从本地上传官方 release 压缩包（sun-panel_vX_linux_arm64.tar.gz），适合无法直连 GitHub 的环境。':
    'Upload an official release tarball from this computer (sun-panel_vX_linux_arm64.tar.gz), useful when GitHub is unreachable.',
  '上传并安装 release 包': 'Upload and install release tarball',
  '更新进度': 'Update progress',
  '本地保留的版本': 'Locally kept versions',
  '稳定通道': 'Stable channel',
  '测试通道（beta）': 'Beta channel',
  '没有可用版本': 'No release available',
  '当前版本': 'Current version',
  '安装此版本': 'Install this version',
  '预发布': 'Pre-release',
  '正式版': 'Official release',
  '已安装': 'Installed',
  '发布时间：%s　大小：%s': 'Released: %s  Size: %s',
  '安装 Sun-Panel %s': 'Install Sun-Panel %s',
  '安装过程会自动备份当前版本，若新版本启动异常会自动回滚。': 'The current version is backed up automatically; the updater rolls back if the new version fails to start.',
  '服务将短暂中断，确认继续？': 'The service restarts briefly. Continue?',
  '取消': 'Cancel',
  '确认安装': 'Install',
  '更新任务已启动，请关注下方进度': 'Update job started, watch the progress below',
  '启动更新失败：%s': 'Failed to start update: %s',
  '离线安装任务已启动': 'Offline install job started',
  '上传或安装失败：%s': 'Upload or install failed: %s',
  '暂无更新任务': 'No update job yet',
  '状态': 'State',
  '版本：%s': 'Version: %s',
  '（暂无日志）': '(no log yet)',
  '暂无历史版本': 'No stored versions',
  '当前': 'current',
  '回滚到此版本': 'Roll back to this version',
  '删除': 'Delete',
  '版本': 'Version',
  '大小': 'Size',
  '操作': 'Actions',
  '回滚到 %s': 'Roll back to %s',
  '当前版本会被保留为历史版本，服务将重启并切换到 %s。': 'The current version is kept as a history entry; the service restarts on %s.',
  '回滚任务已启动': 'Rollback job started',
  '回滚失败：%s': 'Rollback failed: %s',
  '确认回滚': 'Roll back',
  '检测 v1': 'Detect v1',
  '上传备份包': 'Upload backup',
  '部署 v2 试运行': 'Deploy v2 test instance',
  '导入并验证': 'Import and verify',
  '切换正式端口': 'Switch port',
  '完成清理': 'Finish and clean up',
  '检测旧版 v1': 'Detect legacy v1',
  '上传失败：%s': 'Upload failed: %s',
  '上传 v1 备份包 (zip)': 'Upload v1 backup (zip)',
  '部署任务已启动': 'Deployment job started',
  '部署失败：%s': 'Deployment failed: %s',
  '部署 v2 试运行（端口 3004）': 'Deploy v2 test instance (port 3004)',
  '验证试运行实例': 'Verify test instance',
  '切换任务已启动': 'Switch job started',
  '切换失败：%s': 'Switch failed: %s',
  '切换到正式端口': 'Switch to production port',
  '完成清理（归档 v1）': 'Finish (archive v1)',
  '中止并恢复 v1 服务': 'Abort and restore v1',
  '部署中，请稍候…': 'Deploying, please wait…',
  '迁移已完成。旧版 v1 已归档，可在版本管理中查看。': 'Migration complete. The legacy v1 has been archived; see the version manager.',
  '检测到的旧版 v1': 'Detected legacy v1',
  '端口': 'Port',
  '备份包': 'Backup archive',
  '已上传': 'Uploaded',
  '未上传': 'Not uploaded',
  '请打开': 'Please open ',
  '，使用默认账号 admin@sun.cc / 12345678 登录全新 v2，然后进入「系统设置 → 备份恢复」，导入刚上传的 v1 备份包。导入完成并确认内容无误后，回到本页点击「验证试运行实例」。':
    ', sign in to the fresh v2 with the default account admin@sun.cc / 12345678, then import the uploaded v1 backup under "System Settings → Backup & Restore". After verifying the content, return here and click "Verify test instance".',
  '应急操作': 'Emergency actions',
  '若 v2 出现问题需要临时回到 v1（仅当 v1 尚未被清理时可用）：': 'To temporarily fall back to v1 when v2 misbehaves (only while v1 has not been cleaned up):',
  '已切换到 v1 兼容模式': 'Switched to v1 compat mode',
  '强制回到 v1': 'Force back to v1',
  '已取消 v1 强制模式': 'v1 forced mode disabled',
  '取消 v1 强制模式': 'Disable v1 forced mode'
};

const poEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

function emit(entries, langHeader) {
  const lines = [];
  lines.push('msgid ""');
  lines.push('msgstr ""');
  for (const [k, v] of Object.entries(langHeader)) lines.push(`"${poEsc(k)}: ${poEsc(v)}\\n"`);
  lines.push('');
  for (const id of entries) {
    lines.push(`msgid "${poEsc(id)}"`);
    lines.push(`msgstr "${poEsc(id === '' ? '' : id)}"`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function emitPo(entries, translations, langHeader) {
  const lines = [];
  lines.push('msgid ""');
  lines.push('msgstr ""');
  for (const [k, v] of Object.entries(langHeader)) lines.push(`"${poEsc(k)}: ${poEsc(v)}\\n"`);
  lines.push('');
  let translated = 0;
  for (const id of entries) {
    const tr = translations[id] || '';
    if (tr !== '') translated++;
    lines.push(`msgid "${poEsc(id)}"`);
    lines.push(`msgstr "${poEsc(tr)}"`);
    lines.push('');
  }
  return { text: lines.join('\n') + '\n', translated };
}

const headerCommon = {
  'Project-Id-Version': 'luci-app-sunpanel 1.0.0',
  'Report-Msgid-Bugs-To': '',
  'POT-Creation-Date': new Date().toISOString().replace('T', ' ').slice(0, 16),
  'Language': ''
};

// .pot
const potHeader = { ...headerCommon, 'MIME-Version': '1.0', 'Content-Type': 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding': '8bit', 'X-Generator': 'gen_po.mjs' };
const potBody = list.map((id) => `msgid "${poEsc(id)}"\nmsgstr ""\n`).join('\n');
const pot = `msgid ""\nmsgstr ""\n${Object.entries(potHeader).map(([k, v]) => `"${poEsc(k)}: ${poEsc(v)}\\n"`).join('\n')}\n\n${potBody}`;
fs.mkdirSync(path.join(root, 'po/templates'), { recursive: true });
fs.writeFileSync(path.join(root, 'po/templates/sunpanel.pot'), pot, 'utf8');

// zh-cn: source strings are already Chinese; keep a real po for SDK parity.
const zh = emitPo(list, Object.fromEntries(list.map((id) => [id, id])), { ...potHeader, 'Language': 'zh_CN', 'Plural-Forms': 'nplurals=1; plural=0;' });
fs.mkdirSync(path.join(root, 'po/zh-cn'), { recursive: true });
fs.writeFileSync(path.join(root, 'po/zh-cn/sunpanel.po'), zh.text, 'utf8');

// en
const en = emitPo(list, EN_MAP, { ...potHeader, 'Language': 'en', 'Plural-Forms': 'nplurals=2; plural=(n != 1);' });
fs.mkdirSync(path.join(root, 'po/en'), { recursive: true });
fs.writeFileSync(path.join(root, 'po/en/sunpanel.po'), en.text, 'utf8');

const missing = list.filter((id) => !(id in EN_MAP));
console.log(`strings: ${list.length}, en translated: ${en.translated}, missing: ${missing.length}`);
if (missing.length) console.log(missing.join('\n---\n'));
