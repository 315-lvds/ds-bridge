// popup：只负责状态与入口，抓取逻辑全部在工作台
const authEl = document.getElementById('auth');
const lastEl = document.getElementById('last');
const versionEl = document.getElementById('version');
const openBtn = document.getElementById('open');
const quickBtn = document.getElementById('quick');

function setBadge(text, cls) {
  authEl.textContent = text;
  authEl.className = 'badge' + (cls ? ' ' + cls : '');
}

async function checkAuth() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'dsb:get-token' });
    if (res && res.token) { setBadge('已登录', 'ok'); return true; }
    if (res && res.error === 'no_tab') { setBadge('请先打开 chat.deepseek.com', 'bad'); return false; }
    if (res && res.error === 'no_content_script') { setBadge('请刷新 DeepSeek 页面', 'bad'); return false; }
    setBadge('未登录', 'bad');
  } catch (err) {
    setBadge('检查失败', 'bad');
  }
  return false;
}

async function showLast() {
  try {
    const stored = await chrome.storage.local.get(['dsbridge.lastExport', 'lastExport']);
    const lastExport = stored['dsbridge.lastExport'] || stored.lastExport;
    if (!lastExport) { lastEl.textContent = '还没有导出过。'; return; }
    const when = new Date(lastExport.at).toLocaleString();
    const sessions = lastExport.sessions ?? lastExport.count ?? 0;
    const failures = lastExport.failures ?? lastExport.failed ?? 0;
    lastEl.textContent = '上次导出：' + when + ' · ' + sessions + ' 个会话 · ' + failures + ' 个失败';
    if (lastExport.file) lastEl.title = lastExport.file;
  } catch (err) {
    lastEl.textContent = '无法读取上次导出记录。';
  }
}

function openWorkbench(query) {
  chrome.runtime.sendMessage({ type: 'dsb:open-workbench', query: query || '' }).catch(() => {});
}

openBtn.addEventListener('click', () => openWorkbench(''));
quickBtn.addEventListener('click', () => openWorkbench('autostart=all'));

if (versionEl) {
  versionEl.textContent = 'v' + chrome.runtime.getManifest().version + ' · 导出格式 dsbridge.export/v2 · 兼容深桥导入 0.2.2+';
}

checkAuth();
showLast();
