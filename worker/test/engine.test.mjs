import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, normalizePrefs, renderEmail, selectItems, shouldSendToday, validEmail } from "../src/engine.js";

const cats = { campus: "Campus", money: "Tuition & Aid", city: "City" };
const catsZh = { campus: "校园", money: "学费与资助", city: "城市" };
const item = (id, category, importance, extra = {}) => ({ id, category, importance, url: "https://x.test/" + id, zh_title: "标题" + id, zh_points: "要点", en_points: "Points " + id, source: "S", title: "T" + id, ...extra });
const digest = {
  categories: cats,
  categories_zh: catsZh,
  days: [
    { date: "2026-10-09", items: [item("a", "campus", 5), item("b", "city", 2), item("c", "money", 4)] },
    { date: "2026-10-08", items: [item("d", "campus", 3)] },
    { date: "2026-10-01", items: [item("e", "campus", 5)] },
  ],
};
const sub = (o = {}) => ({ categories: ["campus", "money", "city"], frequency: "daily", min_importance: 3, last_sent_date: null, ...o });

test("validEmail accepts normal and rejects injection-ish input", () => {
  assert.ok(validEmail("a.b+c@wisc.edu"));
  for (const bad of ["", "a@b", "a b@c.com", "a@b.com,c@d.com", "<x>@y.com", "a@b.c\r\nBcc: z@z.com", null, "x".repeat(260) + "@a.com"]) assert.equal(validEmail(bad), false, String(bad));
});

test("normalizePrefs drops unknown categories and bad values", () => {
  const p = normalizePrefs({ categories: ["campus", "evil", "campus"], frequency: "hourly", min_importance: 9 }, cats);
  assert.deepEqual(p, { categories: ["campus"], frequency: "daily", min_importance: 3, lang: "zh" });
  assert.equal(normalizePrefs({ lang: "en" }, cats).lang, "en");
  assert.equal(normalizePrefs({ lang: "fr" }, cats).lang, "zh");
  assert.deepEqual(normalizePrefs({ categories: [] }, cats).categories, ["campus", "money", "city"]);
});

test("shouldSendToday: weekly=Monday, monthly=1st, daily once", () => {
  assert.equal(shouldSendToday(sub({ frequency: "weekly" }), "2026-10-12"), true); // Monday
  assert.equal(shouldSendToday(sub({ frequency: "weekly" }), "2026-10-09"), false);
  assert.equal(shouldSendToday(sub({ frequency: "monthly" }), "2026-11-01"), true);
  assert.equal(shouldSendToday(sub({ frequency: "monthly" }), "2026-11-02"), false);
  assert.equal(shouldSendToday(sub(), "2026-10-09"), true);
  assert.equal(shouldSendToday(sub({ last_sent_date: "2026-10-09" }), "2026-10-09"), false);
});

test("selectItems filters by category, importance, window and last send", () => {
  const ids = (s, t) => selectItems(digest, s, t).map((i) => i.id);
  assert.deepEqual(ids(sub(), "2026-10-09"), ["a", "c", "d"]); // b is importance 2; e outside window
  assert.deepEqual(ids(sub({ categories: ["money"] }), "2026-10-09"), ["c"]);
  assert.deepEqual(ids(sub({ min_importance: 5 }), "2026-10-09"), ["a"]);
  assert.deepEqual(ids(sub({ last_sent_date: "2026-10-08" }), "2026-10-09"), ["a", "c"]);
  assert.deepEqual(ids(sub({ frequency: "weekly" }), "2026-10-12"), ["a", "c", "d"]);
  assert.ok(ids(sub({ frequency: "monthly" }), "2026-10-09").includes("e"));
});

test("selectItems positive control: a wrong filter would be caught", () => {
  const all = selectItems(digest, sub({ min_importance: 1 }), "2026-10-09").map((i) => i.id);
  assert.ok(all.includes("b"));
});

test("renderEmail escapes hostile feed text", () => {
  const evil = item("x", "campus", 5, { zh_title: '<script>alert(1)</script>', url: 'https://x.test/"onmouseover="y', zh_points: "<img src=x onerror=1>" });
  const m = renderEmail([evil], sub(), "2026-10-09", digest, { prefs: "https://a/p?t=1", unsubscribe: "https://a/u?t=1" });
  assert.ok(!m.html.includes("<script>") && !m.html.includes("<img"));
  assert.ok(!m.html.includes('"onmouseover="'));
  assert.ok(m.html.includes("退订") && m.text.includes("https://a/u?t=1"));
  assert.match(m.subject, /1 条重要/);
});

test("escapeHtml", () => assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));

test("renderEmail language switch: en uses English fields, zh uses Chinese", () => {
  const items = [item("a", "campus", 5, { deadline: "2026-10-20" })];
  const links = { prefs: "https://a/p", unsubscribe: "https://a/u" };
  const en = renderEmail(items, sub({ lang: "en" }), "2026-10-09", digest, links);
  assert.match(en.subject, /Daily Digest.*1 important/);
  assert.ok(en.html.includes("Points a") && en.html.includes(">Campus<") && en.html.includes("due 2026-10-20") && en.html.includes("Unsubscribe"));
  assert.ok(!en.html.includes("标题a") && !en.html.includes("退订"));
  const zh = renderEmail(items, sub({ lang: "zh" }), "2026-10-09", digest, links);
  assert.ok(zh.html.includes("标题a") && zh.html.includes(">校园<") && zh.html.includes("截止 2026-10-20") && zh.html.includes("退订"));
  assert.ok(!zh.html.includes("Points a"));
  // Missing en_points falls back instead of printing "undefined"
  const old = renderEmail([item("o", "campus", 4, { en_points: undefined })], sub({ lang: "en" }), "2026-10-09", digest, links);
  assert.ok(!old.html.includes("undefined"));
});
