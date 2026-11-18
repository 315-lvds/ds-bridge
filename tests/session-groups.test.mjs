import assert from "node:assert/strict";
import test from "node:test";
import {
  exportStateOf,
  formatGroupTime,
  groupKeyOf,
  groupSessions,
} from "../extension/shared/session-groups.mjs";

const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
const sec = (days, hour = 9) => new Date(2026, 10, 18 - days, hour, 0, 0).getTime() / 1000;

test("groups sessions by pinned and local calendar day", () => {
  const sessions = [
    { id: "pinned", title: "置顶", pinned: true, updated_at: sec(40) },
    { id: "today", title: "今天", updated_at: sec(0) },
    { id: "yesterday", title: "昨天", updated_at: sec(1) },
    { id: "week", title: "七天", updated_at: sec(7) },
    { id: "month", title: "三十天", updated_at: sec(30) },
    { id: "older", title: "更早", updated_at: sec(31) },
  ];

  assert.equal(groupKeyOf(sessions[0], now), "pinned");
  assert.equal(groupKeyOf(sessions[1], now), "today");
  assert.equal(groupKeyOf(sessions[2], now), "yesterday");
  assert.equal(groupKeyOf(sessions[3], now), "week");
  assert.equal(groupKeyOf(sessions[4], now), "month");
  assert.equal(groupKeyOf(sessions[5], now), "older");

  const grouped = groupSessions(sessions, now);
  assert.deepEqual(grouped.map((g) => g.key), ["pinned", "today", "yesterday", "week", "month", "older"]);
  assert.deepEqual(grouped.map((g) => g.sessions.length), [1, 1, 1, 1, 1, 1]);
  assert.equal(grouped[0].label, "置顶");
});

test("reports new, done, and changed export states", () => {
  assert.equal(exportStateOf({ id: "a", updated_at: 10 }, {}), "new");
  assert.equal(exportStateOf({ id: "a", updated_at: 10 }, { a: 10 }), "done");
  assert.equal(exportStateOf({ id: "a", updated_at: 11 }, { a: "10" }), "changed");
});

test("formats group timestamps by group granularity", () => {
  assert.equal(formatGroupTime(sec(0), "today"), "09:00");
  assert.equal(formatGroupTime(sec(7), "week"), "11-11 09:00");
  assert.equal(formatGroupTime(sec(31), "older"), "2026-10-18");
});
