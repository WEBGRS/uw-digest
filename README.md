# UW Digest

A daily digest of UW-Madison news, ranked by importance for students and summarized in Chinese. Live at **https://news.madisonstudents.com**. Visitors can subscribe by email and choose topics, frequency (daily / weekly / monthly) and a minimum importance level.

## How it works

1. `scripts/fetch.py` pulls 14 RSS feeds (university offices, student media, Madison outlets) into `data/pending/<date>.json`.
2. `scripts/daily.ps1` hands the pending items to a headless editor. The default is Gemini (`scripts/judge_gemini.ps1` runs `agy -p` with `scripts/gemini_prompt.md`). Gemini writes `data/inbox/<date>.gemini.json`, with a Chinese and English summary, a category, an importance score 1–5, and an optional deadline and action for every item. It also adds up to 8 stories from news sites that have no working feed. `scripts/submit_digest.py` is the upload step. It validates the file against the pending items, downloads every extra story to confirm its headline, a verbatim quote and its date, and then writes `data/digest/<date>.json`. If validation fails, Gemini gets one repair pass. If Gemini fails entirely, Claude (`claude -p` with `scripts/judge_prompt.md`) does the day instead. Gemini's runbook is `.agents/skills/uw-digest-daily/SKILL.md`.
3. `scripts/build.py` validates the judged file and builds `site/data/digest.json` (last 60 days).
4. `scripts/apply_actions.py` appends deadline items with importance 4+ to the owner's TODO list, using validated fields only.
5. `site/` is a static page that renders the digest and hosts the subscribe form.
6. `worker/` is a Cloudflare Worker with D1: double opt-in subscribe, preference page, one-click unsubscribe, and a daily cron that builds each subscriber's email from `digest.json` (shared logic in `worker/src/engine.js`) and sends it through Resend. Without `RESEND_API_KEY`, emails are written to the `outbox` table instead.

Feed text is untrusted: the editor prompts treat it as data, neither editor gets shell access, extra stories are checked against the live page, and every field is escaped on the page and in emails.

## Run locally

```
start.cmd                       # site on :8820, Worker on :8821
python scripts/fetch.py
powershell -File scripts/daily.ps1
cd worker && node --test test/engine.test.mjs
```

Local Worker secrets go in `worker/.dev.vars` (`ADMIN_TOKEN=...`). Trigger a send: `POST /api/admin/run?date=YYYY-MM-DD&force=1` with `Authorization: Bearer <ADMIN_TOKEN>`.

## Deploy checklist

1. `wrangler d1 create uw-news-digest`, put the id in `worker/wrangler.toml`, then `wrangler d1 execute uw-news-digest --remote --file=worker/schema.sql`.
2. Set `SITE_URL`, `API_URL`, `ALLOW_ORIGINS`, `MAIL_FROM` in `wrangler.toml`; `wrangler secret put RESEND_API_KEY` and `ADMIN_TOKEN`. `MAIL_FROM` needs a domain verified in Resend.
3. `wrangler deploy`, point `site/config.js` at the Worker URL, publish `site/` (for example GitHub Pages).
4. After each daily build, republish `site/data/digest.json` so the Worker cron sees it.
