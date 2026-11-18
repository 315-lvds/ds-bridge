// 把 DeepSeek 消息树渲染成可配置的 Markdown（纯字符串，无依赖）
export const PRESETS = {
  readable: { thinking: 'fold', timestamps: 'frontmatter', comments: true, frontmatter: true, attachments: 'placeholder', branches: 'active', tips: false },
  clean:    { thinking: 'off',  timestamps: 'none',       comments: false, frontmatter: false, attachments: 'none',        branches: 'active', tips: false },
  faithful: { thinking: 'open', timestamps: 'each',       comments: true,  frontmatter: true,  attachments: 'placeholder', branches: 'all',    tips: true },
};

export function fmtTime(sec) {
  if (sec === null || sec === undefined || sec === '') return '';
  const d = new Date(Number(sec) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const fmtDate = (sec) => fmtTime(sec).slice(0, 10);

const fragText = (fragments, type) => (fragments || [])
  .filter((f) => f.type === type)
  .map((f) => f.content || '')
  .filter(Boolean)
  .join('\n\n');

export function extractMessage(msg) {
  const fs = msg.fragments || [];
  const role = String(msg.role || '').toLowerCase();
  const out = {
    id: msg.message_id,
    parent: msg.parent_id === undefined ? null : msg.parent_id,
    role: role,
    ts: msg.inserted_at === undefined ? null : msg.inserted_at,
    model: msg.model || '',
    thinkingEnabled: !!msg.thinking_enabled,
    status: msg.status || '',
    incomplete: !!msg.incomplete_message,
    text: role === 'user' ? fragText(fs, 'REQUEST') : fragText(fs, 'RESPONSE'),
    thinking: [],
    attachments: [],
    tools: [],
  };
  for (const f of fs) {
    if (f.type === 'THINK') out.thinking.push({ text: f.content || '', elapsed: f.elapsed_secs === undefined ? null : f.elapsed_secs });
    else if (f.type === 'FILE') for (const file of (f.files || [])) out.attachments.push(file);
    else if (f.type === 'TOOL_SEARCH' || f.type === 'TOOL_OPEN') out.tools.push({ type: f.type, content: f.content || '', queries: f.queries || [] });
  }
  return out;
}

export function sanitizeName(s, fallback) {
  const base = String(s || '')
    .replace(/[\\/:*?<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim()
    .slice(0, 60);
  return base || (fallback || 'untitled');
}

export function conversationFileName(conv, prefix) {
  const id = (conv.chat_session && conv.chat_session.id) || '';
  const title = sanitizeName(conv.chat_session && conv.chat_session.title, 'untitled');
  return (prefix || 'conversations/') + title + ' [' + String(id).slice(0, 8) + '].md';
}

function renderThinking(block, mode) {
  const body = String(block.text || '').trim();
  if (!body) return '';
  const label = block.elapsed !== null && block.elapsed !== undefined
    ? '思考过程（' + Number(block.elapsed).toFixed(1) + ' 秒）'
    : '思考过程';
  if (mode === 'open') return '### ' + label + '\n\n' + body + '\n';
  return '<details><summary>' + label + '</summary>\n\n' + body + '\n\n</details>\n';
}

export function activeIdsOf(conv) {
  const byId = new Map((conv.chat_messages || []).map((m) => [m.message_id, m]));
  const ids = new Set();
  let cur = conv.chat_session ? conv.chat_session.current_message_id : null;
  const guard = new Set();
  while (cur !== null && cur !== undefined && byId.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    ids.add(cur);
    cur = byId.get(cur).parent_id;
  }
  return ids;
}

export function renderConversation(conv, options, ctx) {
  const o = Object.assign({}, PRESETS.readable, options || {});
  const c = ctx || {};
  const messages = (conv.chat_messages || []).map(extractMessage);
  const byId = new Map(messages.map((m) => [m.id, m]));
  const children = new Map();
  for (const m of messages) {
    const k = m.parent === null || m.parent === undefined ? 'root' : m.parent;
    if (!children.has(k)) children.set(k, []);
    children.get(k).push(m);
  }
  for (const list of children.values()) list.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.id - b.id);
  const current = activeIdsOf(conv);
  const chainIds = Array.isArray(o.chainIds) ? o.chainIds : null;
  const custom = o.branches === 'custom' && chainIds && chainIds.length > 0;
  const chosen = custom ? new Set(chainIds) : current;
  const session = conv.chat_session || {};
  const lines = [];

  if (o.frontmatter) {
    lines.push('---');
    lines.push('title: ' + JSON.stringify(session.title || ''));
    lines.push('conversation_id: ' + JSON.stringify(session.id || ''));
    lines.push('model_type: ' + JSON.stringify(session.model_type || ''));
    lines.push('created: ' + JSON.stringify(fmtDate(session.inserted_at !== undefined ? session.inserted_at : session.updated_at)));
    lines.push('updated: ' + JSON.stringify(fmtTime(session.updated_at)));
    lines.push('messages: ' + messages.length);
    lines.push('active_messages: ' + chosen.size);
    if (custom) lines.push('branch: ' + JSON.stringify('custom'));
    lines.push('exported_at: ' + JSON.stringify(c.exportedAt || new Date().toISOString()));
    lines.push('source: ' + JSON.stringify('https://chat.deepseek.com/a/chat/s/' + (session.id || '')));
    lines.push('generator: ' + JSON.stringify('dsbridge'));
    lines.push('---');
    lines.push('');
  }

  lines.push('# ' + (session.title || '未命名会话'));
  lines.push('');

  if (o.timestamps === 'frontmatter' && session.updated_at) {
    lines.push('> 最后更新 ' + fmtTime(session.updated_at) + ' · ' + messages.length + ' 条消息（本文件含 ' + (o.branches === 'all' ? messages.length : chosen.size) + ' 条）');
    lines.push('');
  }

  let rendered = 0;
  const emit = (m, isActive) => {
    rendered++;
    if (o.comments) {
      lines.push('<!-- ds:message id=' + m.id + ' parent=' + (m.parent === null ? 'null' : m.parent) +
        ' role=' + m.role + ' ts=' + (m.ts === null ? '' : m.ts) + (isActive ? '' : ' variant=alternate') + ' -->');
    }
    const who = m.role === 'user' ? 'USER' : 'ASSISTANT';
    lines.push(o.timestamps === 'each' && fmtTime(m.ts) ? '## ' + who + ' · ' + fmtTime(m.ts) : '## ' + who);
    lines.push('');
    if (o.thinking !== 'off') {
      for (const t of m.thinking) {
        const block = renderThinking(t, o.thinking);
        if (block) { lines.push(block); lines.push(''); }
      }
    }
    const text = String(m.text || '').trim();
    if (text) { lines.push(text); lines.push(''); }
    if (m.attachments.length && o.attachments === 'placeholder') {
      lines.push('附件：');
      for (const a of m.attachments) {
        lines.push('- ' + (a.file_name || 'file') + '（' + (a.file_size === undefined ? '?' : a.file_size) + ' 字节，未下载）');
      }
      lines.push('');
    }
    if (o.tips) {
      for (const t of m.tools) {
        if (t.content) { lines.push('> ' + String(t.content).replace(/\n/g, ' ')); lines.push(''); }
      }
    }
  };
  const walk = (parentKey) => {
    for (const m of children.get(parentKey) || []) {
      if (o.branches !== 'all' && !chosen.has(m.id)) continue;
      emit(m, chosen.has(m.id));
      walk(m.id);
    }
  };
  if (custom) {
    for (const id of chainIds) {
      const m = byId.get(id);
      if (m) emit(m, true);
    }
  } else {
    walk('root');
  }
  return { markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', rendered: rendered };
}
