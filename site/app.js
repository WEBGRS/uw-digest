const API = (window.CONFIG && window.CONFIG.API) || "";
const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    tagline: "UW-Madison news, ranked",
    getEmail: "Get by email",
    front: "Front page",
    alerts: "Alerts",
    most: "Most important",
    latest: "Latest",
    more: "Show more",
    seeAll: "See all ›",
    show: "Show",
    impAll: "All items",
    imp3: "Notable (3+)",
    imp4: "Important only (4+)",
    impEvery: "Everything",
    subTitle: "Get the digest by email",
    email: "Email",
    topics: "Topics",
    often: "How often",
    daily: "Daily",
    weekly: "Weekly (Mondays)",
    monthly: "Monthly (1st)",
    mailLang: "Email language",
    importance: "Importance",
    subscribe: "Subscribe",
    foot: "14 official and local sources, checked every morning; items rated 1–5 for students. Summaries are written by AI from each article's title and excerpt; the linked original is authoritative. Photos come from the source's own feed and belong to their publishers. Not affiliated with UW-Madison.",
    updated: (t, n) => `Updated ${t} · ${n} items in the last 60 days`,
    due: "Due",
    empty: "Nothing at this level yet. Try a lower importance filter.",
    loadFail: "Could not load the digest.",
    badEmail: "Enter a valid email address.",
    noTopic: "Pick at least one topic.",
    ok: "Check your inbox and click the confirmation link.",
    rate: "Too many attempts. Try again in an hour.",
    invalid: "That email address looks invalid.",
    err: "Something went wrong. Try again.",
    net: "Could not reach the server.",
    locale: "en-US",
    placeholder: "you@wisc.edu",
  },
  zh: {
    tagline: "威大消息 · 按重要性排序",
    getEmail: "邮件订阅",
    front: "头版",
    alerts: "要闻",
    most: "最重要",
    latest: "最新",
    more: "显示更多",
    seeAll: "查看全部 ›",
    show: "显示",
    impAll: "全部消息",
    imp3: "值得一看(3 分以上)",
    imp4: "只看重要(4 分以上)",
    impEvery: "全部",
    subTitle: "邮件订阅",
    email: "邮箱",
    topics: "主题",
    often: "频率",
    daily: "每天",
    weekly: "每周一",
    monthly: "每月 1 日",
    mailLang: "邮件语言",
    importance: "重要程度",
    subscribe: "订阅",
    foot: "每天早上检查 14 个官方和本地来源,按对学生的重要性打 1–5 分。摘要由 AI 根据原文标题和摘录整理,以原文为准。图片来自各来源自己的订阅源,版权归原出版方。本站与威斯康星大学无隶属关系。",
    updated: (t, n) => `更新于 ${t} · 近 60 天共 ${n} 条`,
    due: "截止",
    empty: "这个级别暂时没有内容,可以调低重要程度。",
    loadFail: "无法加载内容。",
    badEmail: "请输入有效邮箱。",
    noTopic: "至少选一个主题。",
    ok: "请到邮箱点击确认链接。",
    rate: "尝试次数过多,请一小时后再试。",
    invalid: "邮箱格式不对。",
    err: "出错了,请重试。",
    net: "无法连接服务器。",
    locale: "zh-CN",
    placeholder: "you@wisc.edu",
  },
};

// 24x24 stroke icons per section
const ICONS = {
  all: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5",
  campus: "M3 21h18 M5 21V10 M9 21V10 M15 21V10 M19 21V10 M2 10l10-7 10 7",
  academics: "M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5",
  money: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.7-1.6 M12 6v12",
  international: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18",
  "health-safety": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M12 9v6 M9 12h6",
  events: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 10h18 M8 3v4 M16 3v4",
  city: "M3 21h18 M5 21V9h5v12 M10 21V4h5v17 M15 21v-9h4v9",
};
const NS = "http://www.w3.org/2000/svg";
function icon(k) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", ICONS[k] || ICONS.all);
  s.append(p);
  return s;
}

const PAGE = 30;
const state = { digest: null, cat: "all", min: 3, lang: "en", mailLangTouched: false, limit: PAGE };
const t = (k) => I18N[state.lang][k];

const safeUrl = (u) => (/^https:\/\//.test(u) ? u : "");
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const catColor = (k) => `var(--c-${k}, var(--ink))`;
const catLabel = (k) => ((state.lang === "zh" ? state.digest.categories_zh : state.digest.categories) || state.digest.categories)[k] || k;
const head = (it) => (state.lang === "en" ? it.title : it.zh_title);
const body = (it) => (state.lang === "en" ? it.en_points || it.zh_points : it.zh_points);
const rv = (n, i, cls = "rv") => (n.classList.add(cls), n.style.setProperty("--i", i), n);

function initialLang() {
  try {
    const saved = localStorage.getItem("uwd-lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch {}
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

const fmt = (d, opts) => new Date(d + "T12:00:00").toLocaleDateString(t("locale"), opts);

function link(it, text, cls) {
  const a = el("a", cls, text);
  a.href = it.url.startsWith("http") ? it.url : "#";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Photo from the item's own feed only; no photo (or a broken one) means nothing is drawn
function media(it, credit) {
  const src = it.image ? safeUrl(it.image) : "";
  if (!src) return document.createDocumentFragment();
  const m = el("a", "media");
  m.href = it.url.startsWith("http") ? it.url : "#";
  m.target = "_blank";
  m.rel = "noopener noreferrer";
  m.tabIndex = -1;
  m.setAttribute("aria-hidden", "true");
  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => m.remove());
  img.src = src;
  m.append(img);
  if (credit) m.append(el("span", "credit", it.source));
  return m;
}

function kicker(it) {
  const k = el("span", "kicker", catLabel(it.category));
  k.style.setProperty("--cat", catColor(it.category));
  return k;
}

function byline(it) {
  const b = el("div", "byline");
  b.append(el("span", "stars", "★".repeat(it.importance) + "☆".repeat(5 - it.importance)));
  b.append(el("span", null, state.lang === "en" ? it.source : it.source + " · " + it.title));
  if (it.deadline) b.append(el("span", "due", `${t("due")} ${it.deadline}`));
  return b;
}

// Flat list: best first, then newest, filtered by section and importance
function candidates() {
  const out = [];
  for (const day of state.digest.days) {
    for (const it of day.items) {
      if ((state.cat === "all" || it.category === state.cat) && it.importance >= state.min) out.push({ ...it, day: day.date });
    }
  }
  // Same score: stories with a photo lead, then newest
  return out.sort((a, b) => b.importance - a.importance || Boolean(b.image) - Boolean(a.image) || (b.day > a.day ? 1 : b.day < a.day ? -1 : 0));
}

function renderTicker() {
  const items = [];
  for (const day of state.digest.days.slice(0, 2)) for (const it of day.items) if (it.importance >= 5) items.push(it);
  const box = $("ticker");
  const track = $("tickertrack");
  track.replaceChildren();
  box.hidden = items.length === 0;
  if (!items.length) return;
  // Two copies make the -50% loop seamless
  for (let n = 0; n < 2; n++) for (const it of items.slice(0, 6)) track.append(link(it, head(it)));
}

function render() {
  const front = $("front"), blocks = $("blocks"), feed = $("feed"), band = $("band");
  front.replaceChildren();
  blocks.replaceChildren();
  feed.replaceChildren();
  band.hidden = true;
  if (!state.digest) return;
  renderTicker();
  const list = candidates();
  if (!list.length) {
    front.append(el("div", "empty", t("empty")));
    return;
  }
  // Lead with a real photo when one of the top stories has it
  const withPhoto = list.slice(0, 6).findIndex((i) => i.image);
  if (withPhoto > 0) [list[0], list[withPhoto]] = [list[withPhoto], list[0]];
  const used = new Set();
  const use = (it) => (used.add(it.id), it);

  // Front: lead + two stories on the left, ranked list on the right
  const grid = el("div", "front");
  const leadCol = el("div", "lead-col");
  const lead = rv(el("article", "lead"), 0);
  const L = use(list[0]);
  const h2 = el("h2", "title");
  h2.append(link(L, head(L)));
  lead.append(media(L, true), kicker(L), h2, el("p", null, body(L)), byline(L));
  leadCol.append(lead);
  const pair = list.slice(1, 3).map(use);
  if (pair.length) {
    const row = el("div", "pair");
    pair.forEach((it, i) => {
      const s = rv(el("article", "story"), i + 1);
      const h3 = el("h3", "title");
      h3.append(link(it, head(it)));
      s.append(media(it), kicker(it), h3, el("p", null, body(it)), byline(it));
      row.append(s);
    });
    leadCol.append(row);
  }
  grid.append(leadCol);
  const rank = list.slice(3, 9).map(use);
  if (rank.length) {
    const rail = el("aside", "rail");
    rail.append(el("h2", null, t("most")));
    rank.forEach((it, i) => {
      const r = rv(el("div", "rank"), i + 2);
      r.style.setProperty("--cat", catColor(it.category));
      r.append(el("div", "n", String(i + 1)));
      const c = el("div");
      const h3 = el("h3", "title");
      h3.append(link(it, head(it)));
      c.append(kicker(it), h3);
      r.append(c, media(it));
      rail.append(r);
    });
    grid.append(rail);
  }
  front.append(grid);

  // Section blocks (front page only): colored cards on a tinted band
  if (state.cat === "all") {
    const wrap = el("div", "blocks");
    for (const k of Object.keys(state.digest.categories)) {
      const items = list.filter((i) => i.category === k && !used.has(i.id)).slice(0, 4);
      if (items.length < 2) continue;
      const bl = rv(el("section", "block"), 0, "sr");
      bl.style.setProperty("--cat", catColor(k));
      const hd = el("h2", "blockhead");
      hd.append(icon(k), el("span", null, catLabel(k)));
      const more = el("button", "more-link", t("seeAll"));
      more.type = "button";
      more.addEventListener("click", () => {
        state.cat = k;
        state.limit = PAGE;
        syncNav();
        render();
        window.scrollTo({ top: $("main").offsetTop - 60 });
      });
      hd.append(more);
      bl.append(hd);
      const f = use(items[0]);
      const first = el("div", "first");
      const h3 = el("h3", "title");
      h3.append(link(f, head(f)));
      first.append(h3, el("p", null, body(f)));
      bl.append(media(f), first);
      const ul = el("ul");
      for (const it of items.slice(1).map(use)) {
        const li = el("li");
        li.append(link(it, head(it)));
        ul.append(li);
      }
      bl.append(ul);
      wrap.append(bl);
    }
    if (wrap.children.length) {
      blocks.append(wrap);
      band.hidden = false;
    }
  }

  // Latest: everything else, grouped by day
  const rest = list.filter((i) => !used.has(i.id)).sort((a, b) => (b.day > a.day ? 1 : b.day < a.day ? -1 : b.importance - a.importance));
  if (rest.length) {
    const sec = el("div", "latest");
    sec.append(el("h2", null, t("latest")));
    let day = null, wrap = null;
    for (const it of rest.slice(0, state.limit)) {
      if (it.day !== day) {
        day = it.day;
        wrap = el("div", "day");
        wrap.append(el("h3", "dayh", fmt(day, { weekday: "long", month: "long", day: "numeric" })));
        sec.append(wrap);
      }
      const row = rv(el("article", "row"), 0, "sr");
      row.style.setProperty("--cat", catColor(it.category));
      const h3 = el("h3", "title");
      h3.append(link(it, head(it)));
      const txt = el("div");
      txt.append(kicker(it), h3, el("p", null, body(it)), byline(it));
      row.append(txt, media(it));
      wrap.append(row);
    }
    if (rest.length > state.limit) {
      const m = el("button", "more", `${t("more")} (${rest.length - state.limit})`);
      m.type = "button";
      m.addEventListener("click", () => { state.limit += PAGE; render(); });
      sec.append(m);
    }
    feed.append(sec);
  }
}

function syncNav() {
  for (const c of $("cats").children) c.setAttribute("aria-pressed", String(c.dataset.cat === state.cat));
}

function buildNav() {
  const nav = $("cats");
  nav.replaceChildren();
  const mk = (key, label) => {
    const b = el("button", "navbtn");
    b.append(icon(key), document.createTextNode(label));
    b.type = "button";
    b.dataset.cat = key;
    if (key !== "all") b.style.setProperty("--cat", catColor(key));
    b.setAttribute("aria-pressed", String(key === state.cat));
    b.addEventListener("click", () => {
      state.cat = key;
      state.limit = PAGE;
      syncNav();
      render();
    });
    return b;
  };
  nav.append(mk("all", t("front")));
  for (const k of Object.keys(state.digest.categories)) nav.append(mk(k, catLabel(k)));
  // Subscribe-form topics: keep ticks across a language switch
  const sub = $("subcats");
  const ticked = new Set([...sub.querySelectorAll("input:checked")].map((i) => i.value));
  const first = sub.children.length === 0;
  sub.replaceChildren();
  for (const k of Object.keys(state.digest.categories)) {
    const l = el("label", "pill");
    const i = el("input");
    i.type = "checkbox";
    i.name = "categories";
    i.value = k;
    i.checked = first || ticked.has(k);
    l.append(i, el("span", null, catLabel(k)));
    sub.append(l);
  }
}

function applyLang() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
  $("email").placeholder = t("placeholder");
  document.querySelectorAll(".lg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
  // Mail language follows the page until the visitor picks one
  if (!state.mailLangTouched) document.querySelector(`input[name="lang"][value="${state.lang}"]`).checked = true;
  if (state.digest) {
    const latest = state.digest.days[0] ? state.digest.days[0].date : state.digest.generated.slice(0, 10);
    $("dateline").textContent = fmt(latest, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    $("updated").textContent = t("updated")(state.digest.generated.slice(0, 16).replace("T", " "), state.digest.days.reduce((a, d) => a + d.items.length, 0));
    buildNav();
  }
  $("submsg").textContent = "";
  render();
}

function setLang(l) {
  state.lang = l;
  try { localStorage.setItem("uwd-lang", l); } catch {}
  applyLang();
}

async function submitForm(e) {
  e.preventDefault();
  const f = e.target;
  const msg = $("submsg");
  const email = f.email.value.trim();
  msg.className = "msg";
  const fail = (k) => { msg.textContent = t(k); msg.classList.add("err"); };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("badEmail");
  const cats = [...f.querySelectorAll('input[name="categories"]:checked')].map((c) => c.value);
  if (!cats.length) return fail("noTopic");
  const btn = $("subbtn");
  btn.disabled = true;
  try {
    const r = await fetch(API + "/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, categories: cats, frequency: f.frequency.value, min_importance: Number(f.min_importance.value), lang: f.lang.value, website: f.website.value }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { msg.textContent = t("ok"); msg.classList.add("ok"); }
    else if (r.status === 429) fail("rate");
    else fail(j.error === "invalid_email" ? "invalid" : "err");
  } catch {
    fail("net");
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  state.lang = initialLang();
  document.querySelectorAll(".lg").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  document.querySelectorAll('input[name="lang"]').forEach((r) => r.addEventListener("change", () => (state.mailLangTouched = true)));
  $("minimp").addEventListener("change", (e) => { state.min = Number(e.target.value); state.limit = PAGE; render(); });
  $("subform").addEventListener("submit", submitForm);
  applyLang();
  try {
    state.digest = await (await fetch("data/digest.json", { cache: "no-cache" })).json();
  } catch {
    $("front").append(el("div", "empty", t("loadFail")));
    return;
  }
  applyLang();
}
init();
