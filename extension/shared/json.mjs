// 线性 JSON 导出：普通模式一个文件多条 conversation；全部分支模式每条链一个文件
// 只使用 Web 标准 API，扩展与测试共用。
import { extractMessage, sanitizeName } from './markdown.mjs';

const SCHEMA = 'dsbridge.export/v2';
const GENERATOR = 'dsbridge-extension/0.3.1';
const SITE = 'https://chat.deepseek.com';

function isoFromSec(sec) {
  if (sec === null || sec === undefined || sec === '') return undefined;
  const n = Number(sec);
  if (!Number.isFinite(n)) return undefined;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function byIdOf(conv) {
  return new Map((conv.chat_messages || []).map((m) => [m.message_id, extractMessage(m)]));
}

function treeOf(conv) {
  const messages = (conv.chat_messages || []).map(extractMessage);
  const byId = new Map(messages.map((m) => [m.id, m]));
  const children = new Map();
  for (const m of messages) {
    let p = m.parent;
    if (p === undefined || p === null || !byId.has(p) || p === m.id) p = null;
    m._parent = p;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(m);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.id - b.id);
  }
  return { messages: messages, byId: byId, children: children, roots: children.get(null) || [] };
}

function activeIds(conv) {
  const byId = byIdOf(conv);
  const ids = [];
  let cur = conv.chat_session ? conv.chat_session.current_message_id : null;
  const guard = new Set();
  while (cur !== null && cur !== undefined && byId.has(cur) && !guard.has(cur)) {
    guard.add(cur);
    const m = byId.get(cur);
    ids.push(cur);
    cur = m.parent;
  }
  return ids.reverse();
}

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function bodyOf(m) {
  return String(m.text || '').trim().length > 0 || (m.attachments && m.attachments.length > 0);
}

// 返回稳定的根→叶链。悬空 parent 当作根，保证缺口数据尽量不丢。
export function leafPaths(conv) {
  const t = treeOf(conv);
  const active = activeIds(conv);
  const leaves = [];
  const walk = (node, ids, seen) => {
    if (seen.has(node.id)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(node.id);
    const next = ids.concat(node.id);
    const kids = (t.children.get(node.id) || []).filter((k) => !nextSeen.has(k.id));
    if (!kids.length) {
      const path = next.map((id) => t.byId.get(id)).filter(Boolean);
      leaves.push({ ids: next, leafId: node.id, turns: path.filter((m) => m.role === 'user').length });
      return;
    }
    for (const kid of kids) walk(kid, next, nextSeen);
  };
  for (const root of t.roots) walk(root, [], new Set());
  const total = leaves.length;
  return leaves.map((p, i) => {
    const chain = p.ids.map((id) => t.byId.get(id)).filter(Boolean);
    const branchPath = [];
    for (let k = 1; k < chain.length; k++) {
      const parent = chain[k]._parent;
      const siblings = t.children.get(parent) || [];
      const idx = siblings.findIndex((x) => x.id === chain[k].id);
      branchPath.push(idx + 1);
    }
    return {
      index: i + 1,
      total: total,
      ids: p.ids,
      leafId: p.leafId,
      turns: p.turns,
      isCurrent: active.length > 0 && sameIds(p.ids, active),
      path: branchPath,
    };
  });
}

export function hasFork(conv) {
  const t = treeOf(conv);
  for (const list of t.children.values()) if (list.length > 1) return true;
  return false;
}

function linearMessages(conv, ids, opts) {
  const byId = byIdOf(conv);
  const out = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m || !bodyOf(m)) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const item = { id: m.id, role: m.role, text: m.text };
    const ts = isoFromSec(m.ts);
    if (ts) item.created_at = ts;
    if (opts.includeReasoning && m.thinking && m.thinking.length) {
      const reasoning = m.thinking.filter((t) => String(t.text || '').trim()).map((t) => {
        const r = { text: t.text };
        if (t.elapsed !== null && t.elapsed !== undefined) r.elapsed_secs = Number(t.elapsed);
        return r;
      });
      if (reasoning.length) item.reasoning = reasoning;
    }
    if (opts.includeAttachments && m.attachments && m.attachments.length) {
      item.attachments = m.attachments.map((a) => ({
        name: a.file_name || 'file',
        size: a.file_size === undefined || a.file_size === null ? null : Number(a.file_size),
        is_image: !!a.is_image,
      }));
    }
    if (m.model) item.model = m.model;
    out.push(item);
  }
  return out;
}

function conversationOf(conv, ids, meta, opts) {
  const s = conv.chat_session || {};
  const msgs = linearMessages(conv, ids, opts);
  const firstTs = ids.map((id) => (byIdOf(conv).get(id) || {}).ts).find((x) => x !== null && x !== undefined);
  const created = isoFromSec(s.inserted_at) || isoFromSec(firstTs);
  const out = {
    id: meta.id,
    source_id: s.id,
    source_title: s.title || '',
    title: meta.title,
    model_type: s.model_type || '',
  };
  if (created) out.created_at = created;
  const updated = isoFromSec(s.updated_at);
  if (updated) out.updated_at = updated;
  if (meta.branch) out.branch = meta.branch;
  out.chain = { leaf_message_id: ids.length ? ids[ids.length - 1] : null, message_ids: ids.slice() };
  out.messages = msgs;
  return out;
}

function wrap(conversations, mode, opts, exportedAt) {
  const options = {
    include_reasoning: !!opts.includeReasoning,
    include_attachments: !!opts.includeAttachments,
  };
  if (opts.preset) options.preset = opts.preset;
  return {
    schema: SCHEMA,
    exported_at: exportedAt || new Date().toISOString(),
    generator: GENERATOR,
    source: { site: SITE },
    branch_mode: mode,
    options: options,
    conversations: conversations,
  };
}

// 普通模式：一个 export.json，每个源会话一条线性 conversation。
export function buildExport(convs, opts, exportedAt) {
  const list = [];
  for (const conv of convs || []) {
    const ids = activeIds(conv);
    if (!ids.length) continue;
    const s = conv.chat_session || {};
    const c = conversationOf(conv, ids, { id: s.id, title: s.title || '未命名会话' }, opts);
    if (c.messages.length) list.push(c);
  }
  return wrap(list, 'active', opts, exportedAt);
}

// 全部分支：每条根→叶链一个 export 文档，conversations 恰好一条。
export function buildChainExports(conv, opts, exportedAt, usedNames) {
  const s = conv.chat_session || {};
  const paths = leafPaths(conv);
  const out = [];
  const used = usedNames || new Set();
  for (const p of paths) {
    const title = (s.title || '未命名会话') + ' · 分支 ' + p.index + '/' + p.total + ' · ' + p.turns + ' 轮';
    const c = conversationOf(conv, p.ids, {
      id: String(s.id) + '#' + p.leafId,
      title: title,
      branch: {
        index: p.index,
        total: p.total,
        turns: p.turns,
        leaf_message_id: p.leafId,
        is_current: p.isCurrent,
        path: p.path,
      },
    }, opts);
    if (!c.messages.length) continue;
    out.push({ name: chainFileName(conv, p, used), doc: wrap([c], 'all', opts, exportedAt), meta: { path: p, conversation: c } });
  }
  return out;
}

// 自定义链：每个源会话只选一条根→叶链；一个 export.json 里每条链一条 conversation。
export function buildCustomExport(items, opts, exportedAt) {
  const list = [];
  for (const item of items || []) {
    const conv = item.conv;
    const p = item.path;
    if (!conv || !p || !Array.isArray(p.ids)) continue;
    const s = conv.chat_session || {};
    const title = s.title || '未命名会话';
    const c = conversationOf(conv, p.ids, {
      id: String(s.id) + '#' + p.leafId,
      title: title,
      branch: {
        index: p.index,
        total: p.total,
        turns: p.turns,
        leaf_message_id: p.leafId,
        is_current: p.isCurrent,
        path: p.path,
      },
    }, opts);
    if (c.messages.length) list.push(c);
  }
  return wrap(list, 'custom', opts, exportedAt);
}

export function chainFileName(conv, p, used) {
  const s = conv.chat_session || {};
  let base = sanitizeName(s.title, 'untitled');
  if (p.total > 1) base += ' 分支' + p.index + ' 轮' + p.turns;
  let name = 'json/' + base + '.json';
  const set = used || new Set();
  if (set.has(name)) name = 'json/' + base + ' [' + String(s.id || '').slice(0, 8) + '].json';
  let n = 2;
  const first = name;
  while (set.has(name)) { name = first.replace(/\.json$/, ' (' + n + ').json'); n++; }
  set.add(name);
  return name;
}

export function validateExport(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['not-an-object'], entries: [] };
  if (doc.schema !== SCHEMA) errors.push('bad-schema');
  if (!Array.isArray(doc.conversations)) errors.push('conversations-not-array');
  const mode = doc.branch_mode;
  if (mode !== 'active' && mode !== 'custom' && mode !== 'all') errors.push('bad-branch-mode');
  const list = Array.isArray(doc.conversations) ? doc.conversations : [];
  if (!list.length) errors.push('no-conversations');
  if (mode === 'all' && list.length !== 1) errors.push('all-mode-needs-one-conversation');
  const branchRequired = mode === 'all' || mode === 'custom';
  for (const c of list) {
    if (!c || typeof c !== 'object') { errors.push('bad-conversation'); continue; }
    if (!Array.isArray(c.messages) || !c.messages.length) errors.push('empty-conversation:' + (c.id || '?'));
    if (c.branch && !branchRequired) errors.push('branch-in-non-all:' + (c.id || '?'));
    if (branchRequired && !c.branch) errors.push('missing-branch:' + (c.id || '?'));
    for (const m of c.messages || []) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) errors.push('bad-role:' + (c.id || '?'));
      if (typeof m.text !== 'string') errors.push('bad-text:' + (c.id || '?'));
      if (m.parent_id !== undefined || m.parent !== undefined) errors.push('nonlinear-message:' + (c.id || '?'));
    }
  }
  return { ok: errors.length === 0, errors: errors, entries: list };
}

export const JSON_SCHEMA = SCHEMA;