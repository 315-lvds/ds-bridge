// dsbridge content script：只负责把页面登录态里的 token 交给扩展（不落盘、不打印）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'dsb:get-token') {
    try {
      const raw = localStorage.getItem('userToken');
      const token = raw ? (JSON.parse(raw)?.value ?? null) : null;
      sendResponse({ ok: !!token, token });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
  return true;
});
