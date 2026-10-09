"""Fetch RSS feeds -> data/pending/<date>.json (new, unjudged items only)."""
import hashlib, html, json, re, sys, time, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; uw-news-digest/1.0)"
MAX_AGE_DAYS = 14
PER_SOURCE = 15
MAX_TOTAL = 150
NS = {"c": "http://purl.org/rss/1.0/modules/content/", "d": "http://purl.org/dc/elements/1.1/"}


def clean(text, n=500):
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text or "", flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:n]


def parse_date(s):
    try:
        d = parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def item_id(url):
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def fetch_source(src):
    req = urllib.request.Request(src["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        root = ET.fromstring(r.read())
    out = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        title = clean(it.findtext("title"), 200)
        if not link.startswith("http") or not title:
            continue
        body = it.findtext("c:encoded", namespaces=NS) or it.findtext("description") or ""
        pub = parse_date(it.findtext("pubDate") or "")
        out.append({
            "id": item_id(link), "url": link, "title": title,
            "source": src["name"], "source_id": src["id"], "category_hint": src["category"],
            "published": pub.isoformat() if pub else None,
            "excerpt": clean(body),
        })
    return out


def main():
    cfg = json.loads((ROOT / "scripts" / "sources.json").read_text("utf-8"))
    seen_path = ROOT / "data" / "seen.json"
    seen = json.loads(seen_path.read_text("utf-8")) if seen_path.exists() else {}
    fresh, health = [], {}
    for src in cfg["sources"]:
        try:
            items = fetch_source(src)
        except Exception as e:
            health[src["id"]] = f"ERROR {type(e).__name__}: {e}"
            continue
        health[src["id"]] = len(items)
        keep = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=src.get("max_age_days", MAX_AGE_DAYS))
        for it in items:
            if it["id"] in seen:
                continue
            d = datetime.fromisoformat(it["published"]) if it["published"] else None
            if d and d < cutoff:
                continue
            keep.append(it)
        keep.sort(key=lambda x: x["published"] or "", reverse=True)
        fresh += keep[:PER_SOURCE]
        time.sleep(0.5)
    fresh.sort(key=lambda x: x["published"] or "", reverse=True)
    fresh = fresh[:MAX_TOTAL]
    today = datetime.now().strftime("%Y-%m-%d")
    out = ROOT / "data" / "pending" / f"{today}.json"
    out.write_text(json.dumps(fresh, ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps(health, ensure_ascii=False))
    print(f"pending: {len(fresh)} -> {out}")
    bad = [k for k, v in health.items() if not isinstance(v, int) or v == 0]
    # Fail loudly when most sources are down or empty
    if len(bad) > len(cfg["sources"]) // 2:
        print("TOO MANY SOURCES FAILED:", bad, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
