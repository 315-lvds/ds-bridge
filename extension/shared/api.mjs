// DeepSeek Web 内部 API 的最小客户端（仅 GET，只读）
export const API_BASE = 'https://chat.deepseek.com/api/v0';

export class ApiError extends Error {
  constructor(message, info) {
    super(message);
    this.name = 'ApiError';
    this.status = (info && info.status) || 0;
    this.kind = (info && info.kind) || 'unknown';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, opts) {
  const token = opts.token;
  const retry = opts.retry === undefined ? 2 : opts.retry;
  let lastErr = null;
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const res = await fetch(API_BASE + path, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        throw new ApiError('登录已过期，请在 chat.deepseek.com 重新登录', { status: res.status, kind: 'auth' });
      }
      if (!res.ok) throw new ApiError('HTTP ' + res.status, { status: res.status, kind: 'server' });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { throw new ApiError('响应不是 JSON', { status: res.status, kind: 'shape' }); }
      if (json && json.code !== undefined && json.code !== 0) {
        throw new ApiError(json.msg || ('接口返回 code=' + json.code), { status: res.status, kind: 'server' });
      }
      const biz = json && json.data ? json.data.biz_data : null;
      if (!biz) throw new ApiError('响应缺少 data.biz_data', { status: res.status, kind: 'shape' });
      return biz;
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && (err.kind === 'auth' || err.kind === 'shape')) throw err;
      if (attempt === retry) break;
      await sleep(400 * Math.pow(2, attempt) + Math.random() * 250);
    }
  }
  if (lastErr instanceof ApiError) throw lastErr;
  throw new ApiError(String((lastErr && lastErr.message) || lastErr), { kind: 'network' });
}

export async function fetchSessionPage(token, opts) {
  const o = opts || {};
  let path = '/chat_session/fetch_page?lte_cursor.pinned=' + (o.pinned ? 'true' : 'false');
  if (o.cursor !== undefined && o.cursor !== null) path += '&lte_cursor.updated_at=' + encodeURIComponent(o.cursor);
  const biz = await request(path, { token: token });
  const sessions = Array.isArray(biz.chat_sessions) ? biz.chat_sessions : [];
  return {
    sessions: sessions,
    hasMore: !!biz.has_more,
    lastUpdatedAt: sessions.length ? sessions[sessions.length - 1].updated_at : null,
  };
}

export async function fetchAllSessions(token, opts) {
  const o = opts || {};
  const seen = new Map();
  let cursor = undefined;
  let pages = 0;
  const maxPages = o.maxPages || 400;
  for (;;) {
    const page = await fetchSessionPage(token, { cursor: cursor, pinned: o.pinned });
    pages++;
    for (const s of page.sessions) seen.set(s.id, s);
    if (o.onProgress) o.onProgress({ pages: pages, total: seen.size });
    if (!page.hasMore || page.sessions.length === 0 || pages >= maxPages) break;
    cursor = page.lastUpdatedAt;
    if (cursor === null || cursor === undefined) break;
  }
  return Array.from(seen.values());
}

export async function fetchHistory(token, sessionId) {
  const biz = await request('/chat/history_messages?chat_session_id=' + encodeURIComponent(sessionId), { token: token });
  const messages = Array.isArray(biz.chat_messages) ? biz.chat_messages : [];
  return { chatSession: biz.chat_session || null, chatMessages: messages, cacheResetAt: biz.cache_reset_at || null };
}

export function activeChain(chatSession, messages) {
  const byId = new Map(messages.map((m) => [m.message_id, m]));
  const chain = [];
  let cur = chatSession ? chatSession.current_message_id : null;
  const guard = new Set();
  while (cur !== null && cur !== undefined && byId.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    chain.push(byId.get(cur));
    cur = byId.get(cur).parent_id;
  }
  return chain.reverse();
}