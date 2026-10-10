const API = (window.CONFIG && window.CONFIG.API) || "";
const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    tagline: "UW-Madison news digest",
    getEmail: "Get by email",
    mast: ["Today at ", "UW-Madison"],
    topPicks: "Top picks",
    all: "All",
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
    foot: "14 official and local sources, checked every morning; items rated 1–5 for students. Summaries are written by AI from each article's title and excerpt; the linked original is authoritative. Not affiliated with UW-Madison.",
    updated: (t, n) => `Updated ${t} · ${n} items in the last 60 days`,
    due: "due",
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
    tagline: "威大消息汇总",
    getEmail: "邮件订阅",
    mast: ["", "威大", "今日消息"],
    topPicks: "重点",
    all: "全部",
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
    foot: "每天早上检查 14 个官方和本地来源,按对学生的重要性打 1–5 分。摘要由 AI 根据原文标题和摘录整理,以原文为准。本站与威斯康星大学无隶属关系。",
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

const state = { digest: null, cat: "all", min: 3, lang: "en", mailLangTouched: false };
const t = (k) => I18N[state.lang][k];

const safeUrl = (u) => (/^https?:\/\//.test(u) ? u : "#");
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const catColor = (k) => `var(--c-${k}, var(--ink))`;
const catLabel = (k) => ((state.lang === "zh" ? state.digest.categories_zh : state.digest.categories) || state.digest.categories)[k] || k;

function initialLang() {
  try {
    const saved = localStorage.getItem("uwd-lang");
    if (saved === "en" || saved === "zh") return saved;
  } catch {}
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function dayLabel(d) {
  return new Date(d + "T12:00:00").toLocaleDateString(t("locale"), { weekday: "long", month: "short", day: "numeric" });
}

function renderMast() {
  const h = $("mast");
  h.replaceChildren();
  const [a, b, c] = t("mast");
  h.append(document.createTextNode(a));
  const em = el("em", null, b);
  h.append(em);
  if (c) h.append(document.createTextNode(c));
}

// Newest high-importance items, shown above the feed when no category filter is set
function pickItems() {
  const out = [];
  for (const day of state.digest.days.slice(0, 2)) for (const it of day.items) if (it.importance >= 4) out.push(it);
  return out.slice(0, 3);
}

function render() {
  const feed = $("feed");
  feed.replaceChildren();
  if (!state.digest) return;
  const en = state.lang === "en";
  const picks = state.cat === "all" ? pickItems() : [];
  const pickIds = new Set(picks.map((p) => p.id));
  const grid = $("pickgrid");
  grid.replaceChildren();
  for (const it of picks) {
    const card = el("article", "pick");
    card.style.setProperty("--cat", catColor(it.category));
    const meta = el("div", "meta");
    const tag = el("span", "tag", catLabel(it.category));
    tag.style.setProperty("--cat", catColor(it.category));
    meta.append(tag);
    if (it.deadline) meta.append(el("span", "due", `${t("due")} ${it.deadline}`));
    const h = el("h3");
    const a = el("a", "stretch", en ? it.title : it.zh_title);
    a.href = safeUrl(it.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    h.append(a);
    card.append(meta, h, el("p", null, en ? it.en_points || it.zh_points : it.zh_points));
    grid.append(card);
  }
  $("picks").hidden = picks.length === 0;
  let shown = 0;
  for (const day of state.digest.days) {
    const items = day.items.filter((i) => !pickIds.has(i.id) && (state.cat === "all" || i.category === state.cat) && i.importance >= state.min);
    if (!items.length) continue;
    const sec = el("section", "day");
    sec.append(el("h2", null, dayLabel(day.date)));
    for (const it of items) {
      const row = el("article", "item");
      const meter = el("div", "meter s" + it.importance);
      const dots = el("div", "dots");
      for (let n = 1; n <= 5; n++) dots.append(el("b", n <= it.importance ? "on" : ""));
      meter.append(dots, el("span", null, it.importance + " / 5"));
      row.append(meter);
      const body = el("div");
      const h = el("h3");
      const a = el("a", null, en ? it.title : it.zh_title);
      a.href = safeUrl(it.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      h.append(a);
      body.append(h, el("p", null, en ? it.en_points || it.zh_points : it.zh_points));
      const meta = el("div", "meta");
      const tg = el("span", "tag", catLabel(it.category));
      tg.style.setProperty("--cat", catColor(it.category));
      meta.append(tg);
      meta.append(el("span", null, en ? it.source : it.source + " · " + it.title));
      if (it.deadline) meta.append(el("span", "due", `${t("due")} ${it.deadline}`));
      body.append(meta);
      row.append(body);
      sec.append(row);
      shown++;
    }
    feed.append(sec);
  }
  if (!shown) feed.append(el("div", "empty", t("empty")));
}

function buildFilters() {
  const cats = $("cats");
  cats.replaceChildren();
  const mk = (key, label) => {
    const b = el("button", "chip");
    if (key !== "all") {
      const dot = el("i");
      dot.style.setProperty("--cat", catColor(key));
      b.append(dot);
    }
    b.append(document.createTextNode(label));
    b.type = "button";
    b.dataset.cat = key;
    b.setAttribute("aria-pressed", String(key === state.cat));
    b.addEventListener("click", () => {
      state.cat = key;
      for (const c of cats.children) c.setAttribute("aria-pressed", String(c.dataset.cat === key));
      render();
    });
    return b;
  };
  cats.append(mk("all", t("all")));
  for (const k of Object.keys(state.digest.categories)) cats.append(mk(k, catLabel(k)));
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
  renderMast();
  document.querySelectorAll(".lg").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
  // Mail language follows the page until the visitor picks one
  if (!state.mailLangTouched) document.querySelector(`input[name="lang"][value="${state.lang}"]`).checked = true;
  if (state.digest) {
    $("updated").textContent = t("updated")(state.digest.generated.slice(0, 16).replace("T", " "), state.digest.days.reduce((a, d) => a + d.items.length, 0));
    buildFilters();
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
  $("minimp").addEventListener("change", (e) => { state.min = Number(e.target.value); render(); });
  $("subform").addEventListener("submit", submitForm);
  applyLang();
  try {
    state.digest = await (await fetch("data/digest.json", { cache: "no-cache" })).json();
  } catch {
    $("feed").append(el("div", "empty", t("loadFail")));
    return;
  }
  applyLang();
}
init();
