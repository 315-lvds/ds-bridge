// 深桥导出 · 工作台：会话列表 → 勾选 → 抓取 → 打包 zip
import { fetchAllSessions, fetchHistory, activeChain, ApiError } from './shared/api.mjs';
import { PRESETS, renderConversation, conversationFileName, activeIdsOf } from './shared/markdown.mjs';
import { buildExport, buildChainExports, buildCustomExport, leafPaths } from './shared/json.mjs';
import { buildZip } from './shared/zip.mjs';
import { groupKeyOf, groupSessions, exportStateOf, formatGroupTime } from './shared/session-groups.mjs';

const $ = (id) => document.getElementById(id);
const EXT_VERSION = chrome.runtime.getManifest().version;
const versionPill = $('version-pill');
if (versionPill) versionPill.textContent = 'v' + EXT_VERSION;

const state = {
  token: null,
  sessions: [],
  selected: new Set(),
  exporting: false,
  filterText: '',
  filterMode: 'all',
  sync: { at: null, byId: {} },
};

const SYNC_KEY = 'dsbridge.sync';
const LAST_KEY = 'dsbridge.lastExport';

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad(n) { return String(n).padStart(2, '0'); }
function stampName(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}
function fmtTime(sec) {
  if (!sec) return '';
  const d = new Date(Number(sec) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function setAuth(kind, text) {
  const el = $('auth');
  el.textContent = text;
  el.className = 'badge ' + (kind || '');
}
function banner(text, kind) {
  const el = $('banner');
  if (!text) { el.className = 'banner hidden'; el.textContent = ''; return; }
  el.className = 'banner ' + (kind || 'warn');
  el.textContent = text;
}
function log(line) {
  const el = $('log');
  el.textContent += (el.textContent ? '\n' : '') + line;
  const lines = el.textContent.split('\n');
  if (lines.length > 300) el.textContent = lines.slice(lines.length - 300).join('\n');
  el.scrollTop = el.scrollHeight;
}
function setStatus(t) { $('status').textContent = t; }
function setProgress(done, total, note) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('bar').style.width = pct + '%';
  $('progress-text').textContent = (note || '') + ' ' + done + '/' + total + '（' + pct + '%）';
}

async function getToken(force) {
  if (state.token && !force) return state.token;
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ type: 'dsb:get-token' });
  } catch (e) {
    res = { error: 'internal', detail: String((e && e.message) || e) };
  }
  if (res && res.token) {
    state.token = res.token;
    setAuth('ok', '已登录');
    banner('');
    return state.token;
  }
  state.token = null;
  setAuth('bad', '未连接 DeepSeek');
  if (res && res.error === 'no_tab') {
    banner('请先打开并登录 https://chat.deepseek.com，然后回到本页点“刷新会话列表”。');
  } else if (res && res.error === 'no_content_script') {
    banner('DeepSeek 页面还没有加载 content script：请刷新那个页面，再回到本页重试。');
  } else if (res && res.error === 'no_token') {
    banner('没有读到登录令牌：请在 DeepSeek 页面确认已登录（未登录会被重定向）。');
  } else {
    banner('无法取得登录状态：' + ((res && (res.detail || res.error)) || 'unknown'));
  }
  return null;
}

function readOptions() {
  return {
    preset: $('preset').value,
    markdown: {
      thinking: $('thinking').value,
      timestamps: $('timestamps').value,
      comments: $('comments').checked,
      frontmatter: $('frontmatter').checked,
      attachments: $('attachments').checked ? 'placeholder' : 'none',
      branches: $('branches').value,
      tips: $('tips').checked,
    },
    includeMd: $('inc-md').checked,
    includeJson: $('inc-json').checked,
    incNew: $('inc-new').checked,
    concurrency: Number($('conc').value) || 3,
  };
}

function jsonOptionsOf(opts) {
  return {
    includeReasoning: opts.markdown.thinking !== 'off',
    includeAttachments: opts.markdown.attachments !== 'none',
    preset: opts.preset,
  };
}

function applyPreset(name) {
  const p = PRESETS[name] || PRESETS.readable;
  $('thinking').value = p.thinking;
  $('timestamps').value = p.timestamps;
  $('comments').checked = !!p.comments;
  $('frontmatter').checked = !!p.frontmatter;
  $('attachments').checked = p.attachments !== 'none';
  $('branches').value = p.branches;
  $('tips').checked = !!p.tips;
  branchUiHint();
}

function matchesFilter(s) {
  if (state.filterMode === 'pinned') return !!s.pinned;
  if (state.filterMode === 'unexported') return exportStateOf(s, state.sync.byId) === 'new';
  if (state.filterMode === 'changed') return exportStateOf(s, state.sync.byId) === 'changed';
  return true;
}

function visibleSessions() {
  const q = state.filterText.trim().toLowerCase();
  return state.sessions.filter((s) => {
    if (!matchesFilter(s)) return false;
    if (!q) return true;
    return String(s.title || '').toLowerCase().includes(q) || String(s.id).toLowerCase().includes(q);
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function updateFilterCounts() {
  const counts = { all: state.sessions.length, pinned: 0, unexported: 0, changed: 0 };
  for (const s of state.sessions) {
    if (s.pinned) counts.pinned++;
    const st = exportStateOf(s, state.sync.byId);
    if (st === 'new') counts.unexported++;
    else if (st === 'changed') counts.changed++;
  }
  for (const key of Object.keys(counts)) {
    const node = document.querySelector('[data-count="' + key + '"]');
    if (node) node.textContent = String(counts[key]);
  }
  for (const btn of document.querySelectorAll('#filters button[data-filter]')) {
    const active = btn.dataset.filter === state.filterMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function updateSelCount(rows) {
  const visible = rows || visibleSessions();
  const ids = new Set(visible.map((s) => s.id));
  let hidden = 0;
  for (const id of state.selected) if (!ids.has(id)) hidden++;
  $('sel-count').textContent = '已选 ' + state.selected.size + (hidden ? '（' + hidden + ' 个不在当前筛选）' : '');
  $('shown-count').textContent = '显示 ' + visible.length;
}

function renderRow(s, group) {
  const row = document.createElement('label');
  row.className = 'session' + (state.selected.has(s.id) ? ' selected' : '');
  row.dataset.id = s.id;
  row.dataset.group = group;
  row.title = fmtTime(s.updated_at) + ' · ' + s.id;

  const cb = el('input', 'session-check');
  cb.type = 'checkbox';
  cb.checked = state.selected.has(s.id);
  cb.setAttribute('aria-label', '选择 ' + (s.title || '无标题会话'));
  row.appendChild(cb);

  const body = el('div', 'session-body');
  const titleLine = el('div', 'session-title-line');
  if (s.pinned) {
    const pin = el('span', 'pin', '★');
    pin.title = '置顶';
    pin.setAttribute('aria-label', '置顶');
    titleLine.appendChild(pin);
  }
  titleLine.appendChild(el('span', 'session-title', s.title || '(无标题)'));
  body.appendChild(titleLine);

  const meta = el('div', 'session-meta');
  meta.appendChild(el('span', 'session-time', formatGroupTime(s.updated_at, group)));
  meta.appendChild(el('span', 'dot', '·'));
  meta.appendChild(el('span', '', s.model_type || 'DeepSeek'));
  meta.appendChild(el('span', 'dot', '·'));
  meta.appendChild(el('span', 'session-id', '#' + String(s.id).slice(0, 8)));
  body.appendChild(meta);
  row.appendChild(body);

  const tags = el('div', 'session-tags');
  const st = exportStateOf(s, state.sync.byId);
  if (st === 'done') tags.appendChild(el('span', 'tag tag-done', '已导出'));
  if (st === 'changed') tags.appendChild(el('span', 'tag tag-changed', '有更新'));
  if (tags.childNodes.length) row.appendChild(tags);
  return row;
}

function renderList() {
  const rows = visibleSessions();
  const list = $('sessions');
  list.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const group of groupSessions(rows)) {
    const section = el('section', 'session-group');
    section.dataset.group = group.key;
    const head = el('div', 'group-head');
    const label = el('div', 'group-label');
    label.appendChild(el('span', 'group-name', group.label));
    label.appendChild(el('span', 'group-count', String(group.sessions.length)));
    head.appendChild(label);
    const select = el('button', 'group-select', '全选');
    select.type = 'button';
    select.dataset.selectGroup = group.key;
    select.title = '选择「' + group.label + '」中的全部会话';
    head.appendChild(select);
    section.appendChild(head);
    const body = el('div', 'group-body');
    for (const s of group.sessions) body.appendChild(renderRow(s, group.key));
    section.appendChild(body);
    frag.appendChild(section);
  }
  list.appendChild(frag);

  $('list-total').textContent = String(state.sessions.length);
  const empty = $('empty');
  if (!state.sessions.length) {
    empty.textContent = '登录后会自动加载会话列表。';
    empty.style.display = '';
  } else if (!rows.length) {
    empty.textContent = '没有匹配的会话，试试更换筛选或清空搜索。';
    empty.style.display = '';
  } else {
    empty.style.display = 'none';
  }
  updateFilterCounts();
  updateSelCount(rows);
}

function selectGroup(key) {
  for (const s of visibleSessions()) {
    if (groupKeyOf(s) === key) state.selected.add(s.id);
  }
  renderList();
}

async function loadSessions(force) {
  const token = await getToken(force);
  if (!token) return;
  setStatus('加载会话列表…');
  try {
    const list = await fetchAllSessions(token, {
      onProgress: ({ pages, total }) => setStatus('加载会话列表… 第 ' + pages + ' 页，累计 ' + total + ' 个'),
    });
    state.sessions = list.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
    setStatus('共 ' + state.sessions.length + ' 个会话');
    log('会话列表：' + state.sessions.length + ' 个（' + new Date().toLocaleString() + '）');
    renderList();
  } catch (err) {
    setStatus('加载失败');
    if (err instanceof ApiError && err.kind === 'auth') {
      state.token = null;
      setAuth('bad', '登录已过期');
      banner('登录已过期：请刷新 chat.deepseek.com 页面后重试。');
    } else {
      banner('加载会话列表失败：' + ((err && err.message) || err));
    }
    log('错误：' + ((err && err.message) || err));
  }
}

function makeReadme(manifest) {
  const hasJson = manifest.options.includeJson;
  const all = manifest.options.json_mode === 'all';
  const jsonLines = !hasJson
    ? '- 本次未包含 JSON。'
    : all
      ? '- json/*.json —— 全部分支模式：每条根→叶链一个文件，每个文件只含一条线性会话（无 parent_id）。'
      : '- export.json —— 当前链/自定义链模式：每个勾选会话一条线性会话，不含 parent_id。';
  return [
    '# 深桥导出包',
    '',
    '由深桥导出（DeepSeek Bridge Export）在 ' + manifest.exported_at + ' 生成。',
    '',
    '## 内容',
    '',
    '- conversations/*.md —— 按选项渲染的 Markdown（分支设置见 manifest.options）。',
    jsonLines,
    '- index.md —— 会话与 JSON 文件索引。',
    '- manifest.json —— 本次导出的选项、统计、JSON 文件清单与失败清单。',
    '',
    '## 导入 DeepSeek Harness',
    '',
    '安装深桥导入（DeepSeek Bridge Import）插件后，把这个 zip（或解压出的 export.json / json/*.json 文件）拖入插件：',
    '',
    '1. 选择工作区；',
    '2. 按标题、轮数、时间筛选，逐条勾选要导入的链；',
    '3. 导入后可继续对话。',
    '',
    'DSH 没有分支树，因此全部分支模式下每条链会成为一个独立会话；插件默认不勾选任何链。',
    '本项目不提供 CLI，也不需要把 JSON 上传到任何服务器。',
    '',
    '## 隐私',
    '',
    '本包包含你的聊天记录（可能含个人信息、文件内容摘要）。请自行保管，不要上传到公开位置。',
    '',
    '导出统计：' + manifest.counts.sessions + ' 个会话 / ' + manifest.counts.chains + ' 条链 / ' + manifest.counts.messages + ' 条消息 / ' + manifest.counts.failures + ' 个失败。',
    '',
  ].join('\n');
}
function makeIndex(manifest) {
  const link = (name) => '[' + name.split('/').pop() + '](' + name.split('/').map(encodeURIComponent).join('/') + ')';
  const rows = manifest.conversations.map((c) => {
    const json = (c.json || []).map(link).join('<br>') || '—';
    const md = c.md ? link(c.md.replace('conversations/', 'conversations/')) : '—';
    return '| ' + String(c.title || '').replace(/\|/g, '\\|') + ' | ' + c.messages + ' | ' + (fmtTime(c.updated_at) || '') + ' | ' + md + ' | ' + json + ' |';
  });
  const jsonRows = (manifest.json_files || []).map((j) =>
    '| ' + String(j.title || '').replace(/\|/g, '\\|') + ' | ' + (j.branch_index ? j.branch_index + '/' + j.branch_total : '—') + ' | ' + j.turns + ' | ' + link(j.name) + ' |'
  );
  const failLines = manifest.failures.map((f) => '- ' + (f.title || '') + ' 【' + f.id + '】：' + f.error);
  return [
    '# DeepSeek 会话索引',
    '',
    '导出时间：' + manifest.exported_at + '　|　会话数：' + manifest.counts.sessions + '　|　链数：' + manifest.counts.chains + '　|　失败：' + manifest.counts.failures,
    '',
    '| 会话 | 消息 | 最后更新 | Markdown | JSON |',
    '| --- | ---: | --- | --- | --- |',
    ...rows,
    '',
    jsonRows.length ? '## JSON 链文件\n\n| 链标题 | 分支 | 轮数 | 文件 |\n| --- | ---: | ---: | --- |\n' + jsonRows.join('\n') + '\n' : '',
    failLines.length ? '## 失败清单\n\n' + failLines.join('\n') + '\n' : '',
  ].join('\n');
}
async function runPool(items, worker, concurrency, onDone) {
  let next = 0;
  let done = 0;
  const runners = [];
  for (let i = 0; i < Math.max(1, Math.min(concurrency, items.length)); i++) {
    runners.push((async () => {
      for (;;) {
        const idx = next++;
        if (idx >= items.length) return;
        try {
          await worker(items[idx], idx);
        } finally {
          done++;
          if (onDone) onDone(done);
        }
      }
    })());
  }
  await Promise.all(runners);
}

function branchUiHint() {
  const v = $('branches').value;
  const hint = $('branch-hint');
  const jsonHint = $('json-hint');
  if (v === 'all') {
    hint.textContent = '全部分支会导出 Markdown 全树；勾选 JSON 时每条链一个文件，超过 30 条链会二次确认。';
    jsonHint.textContent = '全部分支：每条链一个 json/*.json；链很多时建议只导 Markdown、当前链或自定义链。';
  } else if (v === 'custom') {
    hint.textContent = '开始导出时打开拓扑选择器；每个会话选一条链，Markdown 与 JSON 都走该链。';
    jsonHint.textContent = '自定义链：一个 export.json，每个会话一条选定的线性会话。';
  } else {
    hint.textContent = '只导当前链；JSON 为一个 export.json。';
    jsonHint.textContent = '当前链：一个 export.json（每条 conversation 都是线性的）。';
  }
}

function openBranchPicker(records) {
  return new Promise((resolve) => {
    const dlg = $('branch-dialog');
    const list = $('branch-list');
    const summary = $('branch-summary');
    list.innerHTML = '';
    let forkCount = 0;
    let maxLeaves = 0;
    for (const rec of records) {
      const paths = leafPaths(rec.conv);
      maxLeaves = Math.max(maxLeaves, paths.length);
      if (paths.length <= 1) continue;
      forkCount++;
      const row = document.createElement('div');
      row.className = 'branch-row';
      const left = document.createElement('div');
      left.className = 'branch-title';
      left.textContent = (rec.s.title || '(无标题)');
      const meta = document.createElement('span');
      meta.className = 'branch-meta';
      meta.textContent = paths.length + ' 条链 · ' + (rec.conv.chat_messages || []).length + ' 条消息 · ' + String(rec.s.id).slice(0, 8);
      left.appendChild(meta);
      const sel = document.createElement('select');
      sel.dataset.session = rec.s.id;
      for (const p of paths) {
        const opt = document.createElement('option');
        opt.value = String(p.leafId);
        if (p.isCurrent) {
          opt.dataset.current = '1';
          opt.selected = true;
        }
        const pathText = p.path.length > 8 ? '…' + p.path.slice(-8).join('→') : p.path.join('→');
        opt.textContent = '分支 ' + p.index + '/' + p.total + ' · ' + p.turns + ' 轮' + (p.isCurrent ? ' · 当前' : '') + (pathText ? ' · 路径 ' + pathText : '');
        sel.appendChild(opt);
      }
      row.appendChild(left);
      row.appendChild(sel);
      list.appendChild(row);
    }
    summary.textContent = '共 ' + records.length + ' 个会话，' + forkCount + ' 个有分叉；单会话最多 ' + maxLeaves + ' 条链。每个会话选一条链，确定后开始导出。';
    if (!forkCount) { resolve(new Map()); return; }
    if (dlg.open) dlg.close('cancel');
    dlg.returnValue = '';
    dlg.showModal();
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue !== 'ok') { resolve(null); return; }
      const choices = new Map();
      for (const sel of list.querySelectorAll('select[data-session]')) {
        const rec = records.find((x) => x.s.id === sel.dataset.session);
        if (!rec) continue;
        const p = leafPaths(rec.conv).find((x) => String(x.leafId) === sel.value);
        if (p) choices.set(rec.s.id, p);
      }
      resolve(choices);
    };
    dlg.addEventListener('close', onClose);
  });
}

async function exportSelected() {
  if (state.exporting) return;
  const opts = readOptions();
  const all = state.sessions.filter((s) => state.selected.has(s.id));
  const targets = opts.incNew ? all.filter((s) => state.sync.byId[s.id] !== s.updated_at) : all;
  if (!targets.length) {
    banner(all.length ? '所选的会话自上次导出后都没有更新。' : '请先在左侧勾选会话。', 'warn');
    return;
  }
  const token = await getToken();
  if (!token) return;
  if (targets.length > 300) {
    const ok = window.confirm('将导出 ' + targets.length + ' 个会话。会话越多，内存与时间开销越大（页面需保持打开）。继续？');
    if (!ok) return;
  }

  const branches = opts.markdown.branches;
  const jsonMode = branches === 'all' ? 'all' : branches === 'custom' ? 'custom' : 'active';
  const includeJson = opts.includeJson;
  state.exporting = true;
  $('export').disabled = true;
  $('export').textContent = '导出中…';
  banner('');
  log('开始导出：' + targets.length + ' 个会话，并发 ' + opts.concurrency + '，分支模式 ' + branches);
  setProgress(0, targets.length, '抓取中');

  const startedAt = new Date();
  const exportedAt = startedAt.toISOString();
  const normalConvs = [];
  const customItems = [];
  const jsonFiles = [];
  const jsonManifest = [];
  const usedChainNames = new Set();
  const mdFiles = [];
  const manifestConvs = [];
  const failures = [];
  const jsonOpts = jsonOptionsOf(opts);
  let jsonConversationCount = 0;
  let exportDoc = null;

  const resetButtons = () => {
    state.exporting = false;
    $('export').disabled = false;
    $('export').textContent = '开始导出';
  };

  const fail = (s, err) => {
    const msg = (err && err.message) || String(err);
    failures.push({ id: s.id, title: s.title || '', error: msg });
    log('失败 ' + String(s.id).slice(0, 8) + '：' + msg);
    if (err instanceof ApiError && err.kind === 'auth') {
      state.token = null;
      setAuth('bad', '登录已过期');
      banner('登录已过期，导出已中断：请刷新 chat.deepseek.com 页面后重试。', 'bad');
      throw err;
    }
  };

  const processConv = (s, conv, chosen) => {
    const chainNames = [];
    if (includeJson) {
      if (jsonMode === 'all') {
        const chains = buildChainExports(conv, jsonOpts, exportedAt, usedChainNames);
        for (const c of chains) {
          jsonFiles.push({ name: c.name, data: JSON.stringify(c.doc) });
          chainNames.push(c.name);
          jsonManifest.push({
            name: c.name,
            source_id: (conv.chat_session && conv.chat_session.id) || s.id,
            title: c.meta.conversation.title,
            branch_index: c.meta.path.index,
            branch_total: c.meta.path.total,
            turns: c.meta.path.turns,
            leaf_message_id: c.meta.path.leafId,
            is_current: c.meta.path.isCurrent,
            messages: c.meta.conversation.messages.length,
          });
        }
        jsonConversationCount += chains.length;
      } else if (jsonMode === 'custom') {
        if (chosen) customItems.push({ conv: conv, path: chosen });
      } else {
        normalConvs.push(conv);
      }
    }
    let mdPath = '';
    if (opts.includeMd) {
      const mdOpts = jsonMode === 'custom' && chosen
        ? Object.assign({}, opts.markdown, { branches: 'custom', chainIds: chosen.ids })
        : opts.markdown;
      const r = renderConversation(conv, mdOpts, { exportedAt });
      mdPath = conversationFileName(conv);
      mdFiles.push({ name: mdPath, data: r.markdown });
    }
    const paths = leafPaths(conv);
    manifestConvs.push({
      id: s.id,
      title: (conv.chat_session && conv.chat_session.title) || s.title || '',
      updated_at: s.updated_at,
      model_type: s.model_type || '',
      pinned: !!s.pinned,
      messages: (conv.chat_messages || []).length,
      active_messages: jsonMode === 'custom' && chosen ? chosen.ids.length : activeIdsOf(conv).size,
      leaves: paths.length,
      selected_branch: chosen ? {
        index: chosen.index,
        total: chosen.total,
        leaf_message_id: chosen.leafId,
        is_current: chosen.isCurrent,
        path: chosen.path,
      } : null,
      json: chainNames,
      md: mdPath,
    });
    state.sync.byId[s.id] = s.updated_at;
  };

  const fetchRecords = async () => {
    const records = [];
    await runPool(targets, async (s) => {
      try {
        const h = await fetchHistory(token, s.id);
        records.push({ s: s, conv: { chat_session: h.chatSession, chat_messages: h.chatMessages, cache_reset_at: h.cacheResetAt } });
      } catch (err) {
        fail(s, err);
      }
    }, opts.concurrency, (done) => setProgress(done, targets.length, '抓取中'));
    return records;
  };

  try {
    if (branches === 'custom') {
      const records = await fetchRecords();
      if (!records.length) {
        log('没有可用的会话，已停止。');
      } else {
        const choices = await openBranchPicker(records);
        if (!choices) {
          log('已取消自定义链导出。');
          banner('已取消自定义链导出；可以改选“仅当前链”或“全部分支”。', 'warn');
          resetButtons();
          return;
        }
        for (const rec of records) {
          try {
            const paths = leafPaths(rec.conv);
            const chosen = choices.get(rec.s.id) || paths.find((p) => p.isCurrent) || paths[0];
            processConv(rec.s, rec.conv, chosen);
          } catch (err) {
            fail(rec.s, err);
          }
        }
      }
    } else if (branches === 'all' && includeJson) {
      const records = await fetchRecords();
      let totalChains = 0;
      let maxChains = 0;
      for (const rec of records) {
        const n = leafPaths(rec.conv).length;
        totalChains += n;
        maxChains = Math.max(maxChains, n);
      }
      if (totalChains > 30) {
        const ok = window.confirm('所选会话共有 ' + totalChains + ' 条链（单会话最多 ' + maxChains + ' 条），全部导出 JSON 会生成 ' + totalChains + ' 个文件。建议只导出 Markdown，或改用“当前链/自定义链”。仍要全部导出 JSON 吗？');
        if (!ok) {
          log('已取消全部分支 JSON 导出；可改选“仅当前链”或“自定义链”。');
          banner('已取消全部分支 JSON 导出；链很多时建议只导 Markdown、当前链或自定义链。', 'warn');
          resetButtons();
          return;
        }
      }
      for (const rec of records) {
        try { processConv(rec.s, rec.conv, null); } catch (err) { fail(rec.s, err); }
      }
    } else {
      await runPool(targets, async (s) => {
        try {
          const h = await fetchHistory(token, s.id);
          const conv = { chat_session: h.chatSession, chat_messages: h.chatMessages, cache_reset_at: h.cacheResetAt };
          processConv(s, conv, null);
        } catch (err) {
          fail(s, err);
        }
      }, opts.concurrency, (done) => setProgress(done, targets.length, '抓取中'));
    }
  } catch (err) {
    log('中断：' + ((err && err.message) || err));
  }

  if (includeJson && jsonMode === 'active') {
    exportDoc = buildExport(normalConvs, jsonOpts, exportedAt);
    jsonConversationCount = exportDoc.conversations.length;
    for (const c of manifestConvs) c.json = ['export.json'];
  } else if (includeJson && jsonMode === 'custom') {
    exportDoc = buildCustomExport(customItems, jsonOpts, exportedAt);
    jsonConversationCount = exportDoc.conversations.length;
    for (const c of manifestConvs) if (c.selected_branch) c.json = ['export.json'];
  }
  manifestConvs.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
  const counts = {
    sessions: manifestConvs.length,
    chains: jsonConversationCount,
    messages: manifestConvs.reduce((n, c) => n + c.messages, 0),
    failures: failures.length,
    json_files: jsonFiles.length + (exportDoc ? 1 : 0),
  };
  const manifest = {
    schema: 'dsbridge.manifest/v2',
    generator: 'dsbridge-extension/0.3.2',
    exported_at: exportedAt,
    source: { site: 'https://chat.deepseek.com', api: 'https://chat.deepseek.com/api/v0' },
    options: Object.assign({}, opts, { json_mode: jsonMode, json: jsonOpts }),
    counts: counts,
    conversations: manifestConvs,
    json_files: jsonManifest,
    failures: failures,
    reimportable: !!(includeJson && (exportDoc || jsonFiles.length)),
  };

  const files = [];
  files.push({ name: 'README.md', data: makeReadme(manifest) });
  files.push({ name: 'index.md', data: makeIndex(manifest) });
  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  for (const f of mdFiles) files.push(f);
  if (exportDoc) files.push({ name: 'export.json', data: JSON.stringify(exportDoc) });
  for (const f of jsonFiles) files.push(f);

  setProgress(targets.length, targets.length, '打包中');
  try {
    const zip = buildZip(files, startedAt);
    const blob = new Blob([zip], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const filename = 'dsbridge-' + stampName(startedAt) + '.zip';
    const downloadId = await chrome.downloads.download({ url: url, filename: filename, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    log('已下载 ' + filename + '：' + (zip.length / 1024 / 1024).toFixed(2) + ' MB，downloadId=' + downloadId);
    const info = {
      at: exportedAt,
      sessions: manifestConvs.length,
      failures: failures.length,
      file: filename,
      bytes: zip.length,
    };
    await chrome.storage.local.set({ [LAST_KEY]: info, [SYNC_KEY]: { at: exportedAt, byId: state.sync.byId } });
    renderList();
    setStatus('导出完成 · ' + info.sessions + ' 个会话' + (failures.length ? ' · ' + failures.length + ' 个失败' : ''));
    setProgress(targets.length, targets.length, failures.length ? '完成（有失败）' : '完成');
    if (failures.length) banner('导出完成，但有 ' + failures.length + ' 个会话失败；详见包内 manifest.json 的 failures。', 'warn');
  } catch (err) {
    log('打包/下载失败：' + ((err && err.message) || err));
    banner('打包或下载失败：' + ((err && err.message) || err), 'bad');
  } finally {
    resetButtons();
  }
}

function bind() {
  $('preset').addEventListener('change', (e) => applyPreset(e.target.value));
  $('search').addEventListener('input', (e) => {
    state.filterText = e.target.value;
    renderList();
  });
  $('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    state.filterMode = btn.dataset.filter;
    renderList();
  });
  $('sel-visible').addEventListener('click', () => {
    for (const s of visibleSessions()) state.selected.add(s.id);
    renderList();
  });
  $('sel-all').addEventListener('click', () => {
    for (const s of state.sessions) state.selected.add(s.id);
    renderList();
  });
  $('sel-none').addEventListener('click', () => {
    state.selected.clear();
    renderList();
  });
  $('sessions').addEventListener('change', (e) => {
    const input = e.target;
    if (!input.matches || !input.matches('input[type="checkbox"]')) return;
    const row = input.closest('.session');
    if (!row) return;
    if (input.checked) state.selected.add(row.dataset.id); else state.selected.delete(row.dataset.id);
    row.classList.toggle('selected', input.checked);
    updateSelCount();
  });
  $('sessions').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-select-group]');
    if (!btn) return;
    selectGroup(btn.dataset.selectGroup);
  });
  $('reload').addEventListener('click', () => loadSessions(true));
  $('export').addEventListener('click', () => exportSelected());
  $('branches').addEventListener('change', branchUiHint);
  $('inc-json').addEventListener('change', branchUiHint);
  $('branch-current').addEventListener('click', () => {
    for (const sel of $('branch-list').querySelectorAll('select[data-session]')) {
      const cur = sel.querySelector('option[data-current="1"]');
      if (cur) sel.value = cur.value;
    }
  });
  $('branch-ok').addEventListener('click', () => {
    const dlg = $('branch-dialog');
    if (dlg.open) dlg.close('ok');
  });
  $('branch-cancel').addEventListener('click', () => {
    const dlg = $('branch-dialog');
    if (dlg.open) dlg.close('cancel');
  });
}

async function init() {
  bind();
  applyPreset('readable');
  try {
    const stored = await chrome.storage.local.get([LAST_KEY, SYNC_KEY]);
    if (stored[LAST_KEY]) {
      const i = stored[LAST_KEY];
      log('上次导出：' + new Date(i.at).toLocaleString() + ' · ' + i.sessions + ' 个会话' + (i.failures ? ' · ' + i.failures + ' 个失败' : ''));
    }
    if (stored[SYNC_KEY]) state.sync = { at: stored[SYNC_KEY].at || null, byId: stored[SYNC_KEY].byId || {} };
  } catch (e) { /* storage 不可用时忽略 */ }
  await loadSessions(false);
  const params = new URLSearchParams(location.search);
  if (params.get('autostart') === 'all' && state.sessions.length) {
    for (const s of state.sessions) state.selected.add(s.id);
    renderList();
    banner('已全选 ' + state.sessions.length + ' 个会话；请确认导出选项后再开始导出。', 'warn');
  }
}

init();