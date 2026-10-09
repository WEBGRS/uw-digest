// Shared logic: subscriber validation, item selection, email rendering
export const FREQUENCIES = ["daily", "weekly", "monthly"];
const WINDOW_DAYS = { daily: 2, weekly: 7, monthly: 31 };
const MAX_ITEMS = { daily: 15, weekly: 25, monthly: 35 };
const FREQ_ZH = { daily: "日报", weekly: "周报", monthly: "月报" };

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
  return { categories: cats, frequency, min_importance };
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

export function renderEmail(items, sub, today, categories, links) {
  const hot = items.filter((i) => i.importance >= 4).length;
  const subject = `UW-Madison ${FREQ_ZH[sub.frequency]} · ${today}` + (hot ? ` · ${hot} 条重要` : "");
  const groups = {};
  for (const it of items) (groups[it.category] ||= []).push(it);
  let html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;max-width:620px;margin:0 auto;color:#1c2330">`;
  html += `<h2 style="margin:0 0 4px">UW-Madison ${FREQ_ZH[sub.frequency]}</h2><div style="color:#4a5568;margin-bottom:16px">${escapeHtml(today)} · 共 ${items.length} 条</div>`;
  let text = `UW-Madison ${FREQ_ZH[sub.frequency]} ${today}\n\n`;
  for (const [cat, list] of Object.entries(groups)) {
    html += `<h3 style="border-bottom:2px solid #c5050c;padding-bottom:4px;margin:20px 0 8px">${escapeHtml(categories[cat] || cat)}</h3>`;
    text += `== ${categories[cat] || cat} ==\n`;
    for (const it of list) {
      const dl = it.deadline ? ` · 截止 ${escapeHtml(it.deadline)}` : "";
      html += `<div style="margin:0 0 12px"><div><span style="color:#c5050c;font-size:12px;letter-spacing:1px">${STARS(it.importance)}</span> <a href="${escapeHtml(it.url)}" style="color:#1c2330;font-weight:600;text-decoration:none">${escapeHtml(it.zh_title)}</a></div>`;
      html += `<div style="margin-top:2px">${escapeHtml(it.zh_points)}${dl}</div>`;
      html += `<div style="color:#4a5568;font-size:12px;margin-top:2px">${escapeHtml(it.source)} · ${escapeHtml(it.title)}</div></div>`;
      text += `[${it.importance}/5] ${it.zh_title}\n  ${it.zh_points}${it.deadline ? " 截止 " + it.deadline : ""}\n  ${it.url}\n`;
    }
    text += "\n";
  }
  html += `<hr style="border:0;border-top:1px solid #d7dce3;margin:24px 0 12px"><div style="font-size:12px;color:#4a5568">摘要由 AI 根据原文标题和摘录整理,以原文为准。<a href="${escapeHtml(links.prefs)}">修改订阅</a> · <a href="${escapeHtml(links.unsubscribe)}">退订</a></div></div>`;
  text += `摘要由 AI 整理,以原文为准。\n修改订阅: ${links.prefs}\n退订: ${links.unsubscribe}\n`;
  return { subject, html, text };
}

export function confirmEmail(link) {
  return {
    subject: "Confirm your UW-Madison digest subscription / 请确认订阅",
    html: `<p>Click to confirm your subscription / 点击确认订阅:</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If you did not sign up, ignore this email. 如非本人操作请忽略。</p>`,
    text: `Confirm / 确认订阅: ${link}\nIf you did not sign up, ignore this email.`,
  };
}
