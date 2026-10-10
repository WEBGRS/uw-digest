// Shared logic: subscriber validation, item selection, email rendering (zh / en)
export const FREQUENCIES = ["daily", "weekly", "monthly"];
export const LANGS = ["zh", "en"];
const WINDOW_DAYS = { daily: 2, weekly: 7, monthly: 31 };
const MAX_ITEMS = { daily: 15, weekly: 25, monthly: 35 };

const T = {
  zh: {
    names: { daily: "日报", weekly: "周报", monthly: "月报" },
    subject: (name, day, hot) => `UW-Madison ${name} · ${day}` + (hot ? ` · ${hot} 条重要` : ""),
    title: (name) => `UW-Madison ${name}`,
    count: (day, n) => `${day} · 共 ${n} 条`,
    due: (d) => ` · 截止 ${d}`,
    footer: "摘要由 AI 根据原文标题和摘录整理,以原文为准。",
    prefs: "修改订阅",
    unsub: "退订",
    confirmSubject: "请确认订阅 UW-Madison 消息汇总 / Confirm your subscription",
    confirmBody: "点击确认订阅:",
    confirmIgnore: "如非本人操作请忽略。",
  },
  en: {
    names: { daily: "Daily", weekly: "Weekly", monthly: "Monthly" },
    subject: (name, day, hot) => `UW-Madison ${name} Digest · ${day}` + (hot ? ` · ${hot} important` : ""),
    title: (name) => `UW-Madison ${name} Digest`,
    count: (day, n) => `${day} · ${n} items`,
    due: (d) => ` · due ${d}`,
    footer: "Summaries are written by AI from each article's title and excerpt; the original is authoritative.",
    prefs: "Manage preferences",
    unsub: "Unsubscribe",
    confirmSubject: "Confirm your UW-Madison digest subscription / 请确认订阅",
    confirmBody: "Click to confirm your subscription:",
    confirmIgnore: "If you did not sign up, ignore this email.",
  },
};
const tr = (lang) => T[LANGS.includes(lang) ? lang : "zh"];

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function validEmail(e) {
  return typeof e === "string" && e.length <= 254 && /^[^\s@<>",;:\\]+@[^\s@<>",;:\\]+\.[^\s@<>",;:\\]{2,}$/.test(e);
}

// Normalize untrusted subscription input against the known category list
export function normalizePrefs(input, categories) {
  const all = Object.keys(categories);
  let cats = Array.isArray(input.categories) ? input.categories.filter((c) => all.includes(c)) : [];
  cats = [...new Set(cats)];
  if (!cats.length) cats = all;
  const frequency = FREQUENCIES.includes(input.frequency) ? input.frequency : "daily";
  const mi = Number(input.min_importance);
  const min_importance = [1, 2, 3, 4, 5].includes(mi) ? mi : 3;
  const lang = LANGS.includes(input.lang) ? input.lang : "zh";
  return { categories: cats, frequency, min_importance, lang };
}

// Weekly goes out on Monday, monthly on the 1st, daily every day
export function shouldSendToday(sub, today) {
  const d = new Date(today + "T12:00:00Z");
  if (sub.last_sent_date === today) return false;
  if (sub.frequency === "weekly") return d.getUTCDay() === 1;
  if (sub.frequency === "monthly") return d.getUTCDate() === 1;
  return true;
}

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Items newer than last send, inside the window, matching prefs, best first
export function selectItems(digest, sub, today) {
  const since = addDays(today, -(WINDOW_DAYS[sub.frequency] - 1));
  const cats = new Set(sub.categories);
  const out = [];
  for (const day of digest.days || []) {
    if (day.date < since || day.date > today) continue;
    if (sub.last_sent_date && day.date <= sub.last_sent_date) continue;
    for (const it of day.items) {
      if (cats.has(it.category) && it.importance >= sub.min_importance) out.push({ ...it, day: day.date });
    }
  }
  out.sort((a, b) => b.importance - a.importance || (b.day > a.day ? 1 : -1));
  return out.slice(0, MAX_ITEMS[sub.frequency]);
}

const STARS = (n) => "●".repeat(n) + "○".repeat(5 - n);

// Category label in the subscriber's language
export const catName = (digest, cat, lang) => (lang === "en" ? digest.categories : digest.categories_zh || digest.categories)[cat] || cat;

export function renderEmail(items, sub, today, digest, links) {
  const lang = LANGS.includes(sub.lang) ? sub.lang : "zh";
  const t = tr(lang);
  const name = t.names[sub.frequency];
  const hot = items.filter((i) => i.importance >= 4).length;
  const groups = {};
  for (const it of items) (groups[it.category] ||= []).push(it);
  const headline = (it) => (lang === "en" ? it.title : it.zh_title);
  const points = (it) => (lang === "en" ? it.en_points || it.zh_points : it.zh_points);
  const subline = (it) => (lang === "en" ? it.source : `${it.source} · ${it.title}`);
  let html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;max-width:620px;margin:0 auto;color:#1c2330">`;
  html += `<h2 style="margin:0 0 4px">${escapeHtml(t.title(name))}</h2><div style="color:#4a5568;margin-bottom:16px">${escapeHtml(t.count(today, items.length))}</div>`;
  let text = `${t.title(name)} ${today}\n\n`;
  for (const [cat, list] of Object.entries(groups)) {
    const label = catName(digest, cat, lang);
    html += `<h3 style="border-bottom:2px solid #c5050c;padding-bottom:4px;margin:20px 0 8px">${escapeHtml(label)}</h3>`;
    text += `== ${label} ==\n`;
    for (const it of list) {
      const dl = it.deadline ? t.due(it.deadline) : "";
      html += `<div style="margin:0 0 12px"><div><span style="color:#c5050c;font-size:12px;letter-spacing:1px">${STARS(it.importance)}</span> <a href="${escapeHtml(it.url)}" style="color:#1c2330;font-weight:600;text-decoration:none">${escapeHtml(headline(it))}</a></div>`;
      html += `<div style="margin-top:2px">${escapeHtml(points(it))}${escapeHtml(dl)}</div>`;
      html += `<div style="color:#4a5568;font-size:12px;margin-top:2px">${escapeHtml(subline(it))}</div></div>`;
      text += `[${it.importance}/5] ${headline(it)}\n  ${points(it)}${dl}\n  ${it.url}\n`;
    }
    text += "\n";
  }
  html += `<hr style="border:0;border-top:1px solid #d7dce3;margin:24px 0 12px"><div style="font-size:12px;color:#4a5568">${escapeHtml(t.footer)} <a href="${escapeHtml(links.prefs)}">${escapeHtml(t.prefs)}</a> · <a href="${escapeHtml(links.unsubscribe)}">${escapeHtml(t.unsub)}</a></div></div>`;
  text += `${t.footer}\n${t.prefs}: ${links.prefs}\n${t.unsub}: ${links.unsubscribe}\n`;
  return { subject: t.subject(name, today, hot), html, text };
}

export function confirmEmail(link, lang) {
  const t = tr(lang);
  return {
    subject: t.confirmSubject,
    html: `<p>${escapeHtml(t.confirmBody)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>${escapeHtml(t.confirmIgnore)}</p>`,
    text: `${t.confirmBody} ${link}\n${t.confirmIgnore}`,
  };
}
