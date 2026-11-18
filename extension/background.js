// dsbridge background：导航、状态汇总、token 桥（token 只经内存转发，绝不写入 chrome.storage）
const DS_ORIGIN = 'https://chat.deepseek.com/*';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'dsb:open-workbench') {
    const qs = msg.query ? '?' + msg.query : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('workbench.html' + qs) });
    sendResponse({ ok: true });
    return;
  }
  if (msg && msg.type === 'dsb:last-export') {
    chrome.storage.local.get('lastExport').then((r) => sendResponse({ lastExport: r.lastExport || null }));
    return true;
  }
  if (msg && msg.type === 'dsb:get-token') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: DS_ORIGIN });
        if (!tabs.length) { sendResponse({ error: 'no_tab' }); return; }
        let sawNoScript = false;
        for (const tab of tabs) {
          try {
            const r = await chrome.tabs.sendMessage(tab.id, { type: 'dsb:get-token' });
            if (r && r.token) { sendResponse({ token: r.token }); return; }
            if (r && r.error) sawNoScript = true;
          } catch (e) {
            sawNoScript = true;
          }
        }
        sendResponse({ error: sawNoScript ? 'no_content_script' : 'no_token' });
      } catch (err) {
        sendResponse({ error: 'internal', message: String(err && err.message || err) });
      }
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // 首次安装不做任何网络请求
});
