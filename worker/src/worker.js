import { confirmEmail, escapeHtml, normalizePrefs, renderEmail, selectItems, shouldSendToday, validEmail } from "./engine.js";

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...extra } });
const page = (title, body) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:16px/1.5 system-ui,'Microsoft YaHei',sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#1c2330;background:#fff"><h2>${escapeHtml(title)}</h2>${body}`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

function cors(env, req) {
  const origins = (env.ALLOW_ORIGINS || "").split(",");
  const o = req.headers.get("origin");
  return o && origins.includes(o)
    ? { "access-control-allow-origin": o, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS", vary: "origin" }
    : {};
}

const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
const today = () => new Date().toISOString().slice(0, 10);

async function loadDigest(env) {
  const r = await fetch(env.SITE_URL + "/data/digest.json", { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error("digest fetch " + r.status);
  return r.json();
}

async function sendMail(env, to, mail, headers = {}) {
  if (!env.RESEND_API_KEY) {
    // Dry run: keep the message in the outbox table
    await env.DB.prepare("INSERT INTO outbox (to_email, subject, html, created) VALUES (?,?,?,?)").bind(to, mail.subject, mail.html, new Date().toISOString()).run();
    return "outbox";
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject: mail.subject, html: mail.html, text: mail.text, headers }),
  });
  if (!r.ok) throw new Error("resend " + r.status + " " + (await r.text()).slice(0, 200));
  return "sent";
}

async function rateLimited(env, req) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const hour = new Date().toISOString().slice(0, 13);
  const key = ip + "|" + hour;
  await env.DB.prepare("INSERT INTO ratelimit (k, n) VALUES (?,1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(key).run();
  const row = await env.DB.prepare("SELECT n FROM ratelimit WHERE k=?").bind(key).first();
  return row.n > 8;
}

const rowToSub = (r) => ({ ...r, categories: JSON.parse(r.categories) });

async function handleSubscribe(req, env, digest) {
  const body = await req.json().catch(() => null);
  if (!body) return { status: 400, body: { ok: false, error: "bad_request" } };
  if (body.website) return { status: 200, body: { ok: true } }; // honeypot
  if (!validEmail(body.email)) return { status: 400, body: { ok: false, error: "invalid_email" } };
  if (await rateLimited(env, req)) return { status: 429, body: { ok: false, error: "rate_limited" } };
  const email = body.email.trim().toLowerCase();
  const prefs = normalizePrefs(body, digest.categories);
  const existing = await env.DB.prepare("SELECT * FROM subscribers WHERE email=?").bind(email).first();
  const tok = existing ? existing.token : token();
  if (existing) {
    // Existing address: only touch prefs once confirmed; never reveal state to the caller
    if (existing.confirmed) {
      await env.DB.prepare("UPDATE subscribers SET categories=?, frequency=?, min_importance=? WHERE email=?").bind(JSON.stringify(prefs.categories), prefs.frequency, prefs.min_importance, email).run();
      return { status: 200, body: { ok: true, status: "check_email" } };
    }
    await env.DB.prepare("UPDATE subscribers SET categories=?, frequency=?, min_importance=? WHERE email=?").bind(JSON.stringify(prefs.categories), prefs.frequency, prefs.min_importance, email).run();
  } else {
    await env.DB.prepare("INSERT INTO subscribers (email, token, categories, frequency, min_importance, confirmed, created) VALUES (?,?,?,?,?,0,?)").bind(email, tok, JSON.stringify(prefs.categories), prefs.frequency, prefs.min_importance, new Date().toISOString()).run();
  }
  if (!existing || !existing.confirmed) {
    await sendMail(env, email, confirmEmail(`${env.API_URL}/api/confirm?t=${tok}`));
  }
  return { status: 200, body: { ok: true, status: "check_email" } };
}

async function prefsPage(env, t, digest, saved) {
  const r = await env.DB.prepare("SELECT * FROM subscribers WHERE token=?").bind(t).first();
  if (!r) return page("Link not valid", "<p>This link is invalid or expired. 链接无效。</p>");
  const s = rowToSub(r);
  const cats = Object.entries(digest.categories).map(([k, v]) => `<label style="display:block"><input type="checkbox" name="c" value="${escapeHtml(k)}" ${s.categories.includes(k) ? "checked" : ""}> ${escapeHtml(v)}</label>`).join("");
  const fr = ["daily", "weekly", "monthly"].map((f) => `<label style="margin-right:12px"><input type="radio" name="frequency" value="${f}" ${s.frequency === f ? "checked" : ""}> ${f}</label>`).join("");
  const mi = [[1, "All"], [3, "Notable (3+)"], [4, "Important only (4+)"]].map(([v, l]) => `<option value="${v}" ${s.min_importance === v ? "selected" : ""}>${l}</option>`).join("");
  return page("Your subscription / 订阅设置", `${saved ? '<p style="color:#0a7a3b">Saved. 已保存。</p>' : ""}<p>${escapeHtml(s.email)}</p>
<form method="post" action="${env.API_URL}/api/prefs?t=${encodeURIComponent(t)}">${cats}<p>${fr}</p><p>Minimum importance: <select name="min_importance">${mi}</select></p>
<button style="padding:8px 16px">Save 保存</button></form>
<p><a href="${env.API_URL}/api/unsubscribe?t=${encodeURIComponent(t)}">Unsubscribe 退订</a></p>`);
}

async function runDigest(env, date = today(), force = false) {
  const digest = await loadDigest(env);
  const { results } = await env.DB.prepare("SELECT * FROM subscribers WHERE confirmed=1").all();
  let sent = 0, skipped = 0, failed = 0;
  for (const row of results) {
    const sub = rowToSub(row);
    if (!force && !shouldSendToday(sub, date)) { skipped++; continue; }
    const items = selectItems(digest, sub, date);
    if (!items.length) { skipped++; continue; }
    const links = { prefs: `${env.API_URL}/api/prefs?t=${sub.token}`, unsubscribe: `${env.API_URL}/api/unsubscribe?t=${sub.token}` };
    try {
      await sendMail(env, sub.email, renderEmail(items, sub, date, digest.categories, links), {
        "List-Unsubscribe": `<${links.unsubscribe}>`,
      });
      await env.DB.prepare("UPDATE subscribers SET last_sent_date=? WHERE id=?").bind(date, sub.id).run();
      sent++;
    } catch (e) {
      failed++;
      console.error("send failed", sub.id, String(e));
    }
  }
  return { sent, skipped, failed };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const c = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
    try {
      if (url.pathname === "/api/subscribe" && req.method === "POST") {
        const digest = await loadDigest(env);
        const r = await handleSubscribe(req, env, digest);
        return json(r.body, r.status, c);
      }
      const t = url.searchParams.get("t") || "";
      if (url.pathname === "/api/confirm") {
        const r = await env.DB.prepare("UPDATE subscribers SET confirmed=1 WHERE token=?").bind(t).run();
        return r.meta.changes
          ? page("Subscribed ✓ 订阅成功", `<p>You will get the digest by email. 之后会按你选的频率收到邮件。</p><p><a href="${env.API_URL}/api/prefs?t=${encodeURIComponent(t)}">Change preferences 修改订阅</a></p>`)
          : page("Link not valid", "<p>Invalid link. 链接无效。</p>");
      }
      if (url.pathname === "/api/prefs") {
        const digest = await loadDigest(env);
        if (req.method === "POST") {
          const form = await req.formData();
          const prefs = normalizePrefs({ categories: form.getAll("c"), frequency: form.get("frequency"), min_importance: form.get("min_importance") }, digest.categories);
          await env.DB.prepare("UPDATE subscribers SET categories=?, frequency=?, min_importance=? WHERE token=?").bind(JSON.stringify(prefs.categories), prefs.frequency, prefs.min_importance, t).run();
          return prefsPage(env, t, digest, true);
        }
        return prefsPage(env, t, digest, false);
      }
      if (url.pathname === "/api/unsubscribe") {
        if (req.method === "POST" || url.searchParams.get("go") === "1") {
          await env.DB.prepare("DELETE FROM subscribers WHERE token=?").bind(t).run();
          return page("Unsubscribed 已退订", "<p>You are off the list. 已退订。</p>");
        }
        return page("Unsubscribe? 确认退订", `<form method="post" action="${env.API_URL}/api/unsubscribe?t=${encodeURIComponent(t)}"><button style="padding:8px 16px">Unsubscribe 退订</button></form>`);
      }
      // Manual trigger for the owner (dry run lands in outbox)
      if (url.pathname === "/api/admin/run" && req.method === "POST") {
        if (!env.ADMIN_TOKEN || req.headers.get("authorization") !== "Bearer " + env.ADMIN_TOKEN) return json({ ok: false }, 401);
        return json({ ok: true, ...(await runDigest(env, url.searchParams.get("date") || today(), url.searchParams.get("force") === "1")) });
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch (e) {
      console.error(String(e));
      return json({ ok: false, error: "server_error" }, 500, c);
    }
  },
  async scheduled(_event, env) {
    console.log(JSON.stringify(await runDigest(env)));
  },
};
