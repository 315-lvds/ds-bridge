// 会话时间分组与导出状态标注（工作台与测试共用）
export const GROUP_DEFS = [
  { key: 'pinned', label: '置顶' },
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '7 天内' },
  { key: 'month', label: '30 天内' },
  { key: 'older', label: '30 天外' },
];

function dayNumberFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function dayNumberFromSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  return dayNumberFromMs(n * 1000);
}

export function groupKeyOf(session, nowMs) {
  if (session && session.pinned) return 'pinned';
  const today = dayNumberFromMs(nowMs === undefined ? Date.now() : nowMs);
  const then = dayNumberFromSec(session && session.updated_at);
  if (then === null || today === null) return 'older';
  const diff = today - then;
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 7) return 'week';
  if (diff <= 30) return 'month';
  return 'older';
}

export function groupSessions(sessions, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const buckets = new Map();
  for (const session of sessions || []) {
    const key = groupKeyOf(session, now);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(session);
  }
  const result = [];
  for (const def of GROUP_DEFS) {
    const rows = buckets.get(def.key);
    if (!rows || !rows.length) continue;
    rows.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
    result.push({ key: def.key, label: def.label, sessions: rows });
  }
  return result;
}

export function exportStateOf(session, byId) {
  if (!session) return 'new';
  const seen = byId ? byId[session.id] : undefined;
  if (seen === undefined || seen === null) return 'new';
  return String(seen) === String(session.updated_at) ? 'done' : 'changed';
}

export function formatGroupTime(updatedAt, group) {
  const d = new Date(Number(updatedAt) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (group === 'today' || group === 'yesterday') return hm;
  if (group === 'week' || group === 'month') return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
