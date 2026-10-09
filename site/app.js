const API = (window.CONFIG && window.CONFIG.API) || "";
const $ = (id) => document.getElementById(id);
const state = { digest: null, cat: "all", min: 3 };

const safeUrl = (u) => (/^https?:\/\//.test(u) ? u : "#");
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function dayLabel(d) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function render() {
  const feed = $("feed");
  feed.replaceChildren();
  let shown = 0;
  for (const day of state.digest.days) {
    const items = day.items.filter((i) => (state.cat === "all" || i.category === state.cat) && i.importance >= state.min);
    if (!items.length) continue;
    const sec = el("section", "day");
    sec.append(el("h2", null, dayLabel(day.date)));
    for (const it of items) {
      const row = el("article", "item");
      row.append(el("div", "score s" + it.importance, it.importance + " / 5"));
      const body = el("div");
      const h = el("h3");
      const a = el("a", null, it.zh_title);
      a.href = safeUrl(it.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      h.append(a);
      body.append(h, el("p", null, it.zh_points));
      const meta = el("div", "meta");
      meta.append(el("span", "tag", state.digest.categories[it.category] || it.category));
      meta.append(document.createTextNode(it.source + " · " + it.title));
      if (it.deadline) meta.append(el("span", "due", "  · due " + it.deadline));
      body.append(meta);
      row.append(body);
      sec.append(row);
      shown++;
    }
    feed.append(sec);
  }
  if (!shown) feed.append(el("div", "empty", "Nothing at this level yet. Try a lower importance filter."));
}

function buildFilters() {
  const cats = $("cats");
  const mk = (key, label) => {
    const b = el("button", "chip", label);
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
  cats.append(mk("all", "All"));
  for (const [k, v] of Object.entries(state.digest.categories)) cats.append(mk(k, v));
  $("minimp").addEventListener("change", (e) => {
    state.min = Number(e.target.value);
    render();
  });
  const sub = $("subcats");
  for (const [k, v] of Object.entries(state.digest.categories)) {
    const l = el("label");
    const i = el("input");
    i.type = "checkbox";
    i.name = "categories";
    i.value = k;
    i.checked = true;
    l.append(i, document.createTextNode(v));
    sub.append(l);
  }
}

async function submitForm(e) {
  e.preventDefault();
  const f = e.target;
  const msg = $("submsg");
  const email = f.email.value.trim();
  msg.className = "msg";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    msg.textContent = "Enter a valid email address. 请输入有效邮箱。";
    msg.classList.add("err");
    return;
  }
  const cats = [...f.querySelectorAll('input[name="categories"]:checked')].map((c) => c.value);
  if (!cats.length) {
    msg.textContent = "Pick at least one topic. 至少选一个主题。";
    msg.classList.add("err");
    return;
  }
  const btn = $("subbtn");
  btn.disabled = true;
  try {
    const r = await fetch(API + "/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, categories: cats, frequency: f.frequency.value, min_importance: Number(f.min_importance.value), website: f.website.value }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      msg.textContent = "Check your inbox and click the confirmation link. 请到邮箱点击确认链接。";
      msg.classList.add("ok");
    } else if (r.status === 429) {
      msg.textContent = "Too many attempts. Try again in an hour. 请稍后再试。";
      msg.classList.add("err");
    } else {
      msg.textContent = j.error === "invalid_email" ? "That email address looks invalid. 邮箱格式不对。" : "Something went wrong. Try again. 出错了,请重试。";
      msg.classList.add("err");
    }
  } catch {
    msg.textContent = "Could not reach the server. 无法连接服务器。";
    msg.classList.add("err");
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  try {
    const r = await fetch("data/digest.json", { cache: "no-cache" });
    state.digest = await r.json();
  } catch {
    $("feed").append(el("div", "empty", "Could not load the digest."));
    return;
  }
  const n = state.digest.days.reduce((a, d) => a + d.items.length, 0);
  $("updated").textContent = `Updated ${state.digest.generated.slice(0, 16).replace("T", " ")} · ${n} items in the last 60 days`;
  buildFilters();
  render();
  $("subform").addEventListener("submit", submitForm);
}
init();
