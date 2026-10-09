# UW Digest

A daily digest of UW-Madison news, ranked by importance for students and summarized in Chinese. Visitors can subscribe by email and choose topics, frequency (daily / weekly / monthly) and a minimum importance level.

## How it works

1. `scripts/fetch.py` pulls 14 RSS feeds (university offices, student media, Madison outlets) into `data/pending/<date>.json`.
2. `scripts/daily.ps1` hands the pending items to headless Claude (`claude -p`, Read/Write tools only) using `scripts/judge_prompt.md`. Claude writes `data/digest/<date>.json`: a Chinese headline and key points, a category, an importance score 1–5, an optional deadline and action.
3. `scripts/build.py` validates the judged file and builds `site/data/digest.json` (last 60 days).
4. `scripts/apply_actions.py` appends deadline items with importance 4+ to the owner's TODO list, using validated fields only.
5. `site/` is a static page that renders the digest and hosts the subscribe form.
6. `worker/` is a Cloudflare Worker with D1: double opt-in subscribe, preference page, one-click unsubscribe, and a daily cron that builds each subscriber's email from `digest.json` (shared logic in `worker/src/engine.js`) and sends it through Resend. Without `RESEND_API_KEY`, emails are written to the `outbox` table instead.

Feed text is untrusted: the judge prompt treats it as data, the judge has no shell access, and every field is escaped on the page and in emails.

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
