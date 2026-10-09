@echo off
cd /d %~dp0
start "uw-news-site" python -m http.server 8820 --directory site
cd worker
if not exist .wrangler\state call npx wrangler d1 execute uw-news-digest --local --file=schema.sql
start "uw-news-api" npx wrangler dev --port 8821 --inspector-port 9331 --persist-to .wrangler\state
