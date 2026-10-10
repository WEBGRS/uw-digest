"""Pick and verify one thumbnail URL per item (feed-provided images only, never re-hosted)."""
import json, re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; uw-news-digest/1.0)"
MRSS = "http://search.yahoo.com/mrss/"
CONTENT = "http://purl.org/rss/1.0/modules/content/"


def extract(it):
    """Raw image candidate from one RSS <item> element."""
    for tag in (f"{{{MRSS}}}content", f"{{{MRSS}}}thumbnail"):
        e = it.find(tag)
        if e is not None and e.get("url"):
            return e.get("url")
    e = it.find("enclosure")
    if e is not None and "image" in (e.get("type") or ""):
        return e.get("url")
    html = (it.findtext(f"{{{CONTENT}}}encoded") or "") + (it.findtext("description") or "")
    m = re.search(r'<img[^>]+src=["\']([^"\']+)', html)
    return m.group(1) if m else None


def candidates(url):
    """Bigger variants first, original last."""
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    out = []
    # WordPress thumbnails: name-150x150.jpg -> name.jpg
    big = re.sub(r"-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)(?:\?|$))", "", url)
    if big != url:
        out.append(big)
    # townnews: ?resize=300%2C200 -> larger
    if "resize=" in url:
        out.append(re.sub(r"resize=[^&]+", "resize=900%2C600", url))
    out.append(url)
    secure = [u.replace("http://", "https://", 1) if u.startswith("http://") else u for u in out]
    seen, res = set(), []
    for u in secure + out:
        if u not in seen:
            seen.add(u)
            res.append(u)
    return res


def ok(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
        with urllib.request.urlopen(req, timeout=15) as r:
            ct = r.headers.get("content-type", "")
            n = int(r.headers.get("content-length") or 0)
            return ct.startswith("image/") and "gif" not in ct and (n == 0 or n > 4000)
    except Exception:
        return False


def resolve(raw):
    if not raw or not raw.startswith(("http", "//")):
        return None
    if urlsplit(raw).path.lower().endswith(".gif"):
        return None
    for u in candidates(raw):
        if ok(u):
            return u
    return None


def update(path, wanted):
    """wanted: {id: raw_url}. Resolve new ids only; persist {id: url|null}."""
    cur = json.loads(path.read_text("utf-8")) if path.exists() else {}
    todo = {i: r for i, r in wanted.items() if i not in cur}
    with ThreadPoolExecutor(8) as ex:
        for i, u in zip(todo, ex.map(resolve, todo.values())):
            cur[i] = u
    path.write_text(json.dumps(cur, indent=0), "utf-8")
    return len(todo), sum(1 for i in todo if cur[i])
