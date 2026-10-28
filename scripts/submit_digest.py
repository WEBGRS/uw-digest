"""Upload interface for the Gemini editor.

python scripts/submit_digest.py data/inbox/<day>.gemini.json [--check] [--lenient] [--extras-only] [--no-publish]

Validates the editor file against data/pending/<day>.json, verifies every extra by downloading it,
writes data/digest/<day>.json (or <day>-g.json), then runs build.py, apply_actions.py and publish.ps1.
Exit 0 ok, 2 unreadable input, 3 validation errors (listed in <inbox>.errors.txt).
"""
import argparse, hashlib, html, json, re, subprocess, sys, urllib.request
from datetime import date, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import images

ROOT = Path(__file__).resolve().parent.parent
CATS = sorted(json.loads((ROOT / "scripts" / "sources.json").read_text("utf-8"))["categories"])
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CJK = re.compile(r"[一-鿿]")
LIMITS = {"zh_title": 28, "zh_points": 90, "en_points": 180, "action": 40}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
EXTRA_DOMAINS = ("wisc.edu", "dailycardinal.com", "badgerherald.com", "cityofmadison.com", "madison.com",
                 "captimes.com", "wpr.org", "channel3000.com", "nbc15.com", "wkow.com", "isthmus.com",
                 "federalregister.gov", "uscis.gov", "ice.gov", "dhs.gov", "state.gov", "wisconsin.gov", "wi.gov")
MAX_EXTRAS = 8
EXTRA_WINDOW_DAYS = 7
TRACKING = re.compile(r"^(utm_|ct$|cv$|fbclid$|gclid$|mc_)")
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
STOP = {"the", "and", "for", "with", "from", "that", "this", "are", "was", "has", "have", "will", "new",
        "its", "into", "after", "about", "over", "uw", "madison", "news", "wisconsin"}


def norm(s):
    s = html.unescape(s or "")
    for a, b in (("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'), ("–", "-"),
                 ("—", "-"), (" ", " "), ("…", "...")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()


def words(s):
    return {w for w in re.findall(r"[a-z0-9]{3,}", norm(s)) if w not in STOP}


def overlap(a, b):
    """Share of a's words found in b."""
    wa = words(a)
    return len(wa & words(b)) / len(wa) if wa else 0.0


def date_forms(d, year=True):
    m = MONTHS[d.month - 1]
    ab = {"september": "sept"}.get(m, m[:3])
    md = [f"{m} {d.day}", f"{ab}. {d.day}", f"{ab} {d.day}", f"{d.month}/{d.day}"]
    if not year:
        return md
    return [f"{x}, {d.year}" for x in md[:3]] + [f"{x} {d.year}" for x in md[:3]] + [
        f"{d.month}/{d.day}/{d.year}", f"{d.month}/{d.day}/{d.year % 100:02d}", d.isoformat(),
        f"{d.month:02d}/{d.day:02d}/{d.year}", f"{d.day} {m} {d.year}"]


def mentions_date(text, d, year=True):
    return any(re.search(r"(?<![\w/])" + re.escape(f) + r"(?!\d)", text) for f in date_forms(d, year))


def numbers(s):
    """Numeric values in text; 万/亿 and million/billion are expanded."""
    out = set()
    for n, unit in re.findall(r"(\d[\d,]*(?:\.\d+)?)\s*(万|亿|million|billion)?", s or "", re.I):
        try:
            v = float(n.replace(",", ""))
        except ValueError:
            continue
        out.add(v)
        mult = {"万": 1e4, "亿": 1e8, "million": 1e6, "billion": 1e9}.get(unit.lower() if unit else "")
        if mult:
            out.add(v * mult)
    return out


def unsupported_numbers(fields, src_nums):
    bad = []
    for v in sorted(numbers(" ".join(fields))):
        if v in src_nums or v <= 12 or v in (2026, 2027):
            continue
        if v.is_integer() and 13 <= v <= 24 and v - 12 in src_nums:  # 24h clock
            continue
        if any(abs(v * m - s) < 1e-6 for m in (1e4, 1e6) for s in src_nums):  # 20万 / 1.5 million
            continue
        bad.append(f"{v:g}")
    return bad


def clean_url(u):
    p = urlsplit(u.strip())
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), ""))


def item_id(url):
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=25) as r:
        ct = r.headers.get("content-type", "")
        raw = r.read(4_000_000)
        cs = r.headers.get_content_charset() or "utf-8"
        return r.status, ct, raw.decode(cs, "replace")


def meta(page, *names):
    out = []
    for n in names:
        for pat in (rf'<meta[^>]+(?:property|name|itemprop)=["\']{n}["\'][^>]*content=["\']([^"\']+)',
                    rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name|itemprop)=["\']{n}["\']'):
            out += re.findall(pat, page, re.I)
    return [html.unescape(x).strip() for x in out]


def page_titles(page):
    t = meta(page, "og:title", "twitter:title")
    t += [re.sub(r"<[^>]+>", " ", x) for x in re.findall(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)[:1]]
    t += [re.sub(r"<[^>]+>", " ", x) for x in re.findall(r"<h1[^>]*>(.*?)</h1>", page, re.S | re.I)[:2]]
    return [html.unescape(re.sub(r"\s+", " ", x)).strip() for x in t if x.strip()]


def page_dates(page):
    """Publication dates found in page metadata, most authoritative first."""
    raw = meta(page, "article:published_time", "og:published_time", "datePublished", "pubdate", "dc.date", "date")
    raw += re.findall(r'"datePublished"\s*:\s*"([^"]+)"', page)
    raw += re.findall(r'<time[^>]+datetime=["\']([^"\']+)', page, re.I)[:3]
    out = []
    for x in raw:
        try:
            d = date.fromisoformat(x[:10])
        except ValueError:
            continue
        if d not in out:
            out.append(d)
    return out


def page_text(page):
    s = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    return norm(re.sub(r"<[^>]+>", " ", s))


def has_quote(quote, text):
    q = norm(quote)
    if q in text:
        return True
    m = SequenceMatcher(None, text, q, autojunk=False).find_longest_match(0, len(text), 0, len(q))
    return m.size >= 0.85 * len(q)


def check_fields(e, label, errs, warns, lenient):
    if e.get("category") not in CATS:
        errs.append(f"{label}: category {e.get('category')!r} must be one of {CATS}")
    imp = e.get("importance")
    if type(imp) is not int or not 1 <= imp <= 5:
        errs.append(f"{label}: importance must be an integer 1-5, got {imp!r}")
    if not isinstance(e.get("drop", False), bool):
        errs.append(f"{label}: drop must be true or false")
    drop = e.get("drop") is True
    for f in ("zh_title", "zh_points", "en_points"):
        v = e.get(f)
        if drop:
            if not isinstance(v, str) or not v.strip():
                e[f] = "-"
            continue
        if not isinstance(v, str) or v.strip() in ("", "-"):
            errs.append(f"{label}: {f} is empty")
            continue
        if f != "en_points" and not CJK.search(v):
            errs.append(f"{label}: {f} must be Chinese")
        if f == "en_points" and CJK.search(v):
            errs.append(f"{label}: en_points must be English")
        if len(v) > LIMITS[f]:
            msg = f"{label}: {f} has {len(v)} chars, limit {LIMITS[f]}"
            (warns if lenient or len(v) <= LIMITS[f] * 1.15 else errs).append(msg)
    d = e.get("deadline")
    if d is not None and not (isinstance(d, str) and DATE.match(d)):
        errs.append(f"{label}: deadline must be \"YYYY-MM-DD\" or null, got {d!r}")
    a = e.get("action")
    if a is not None and not isinstance(a, str):
        errs.append(f"{label}: action must be a string or null")
    elif a and len(a) > LIMITS["action"]:
        warns.append(f"{label}: action has {len(a)} chars")
    if not drop and imp == 5 and not e.get("action") and e.get("category") not in ("international", "health-safety"):
        warns.append(f"{label}: importance 5 without an action")


def entry(base, e):
    out = {k: base[k] for k in ("id", "title", "url", "source", "published")}
    for k in ("category", "zh_title", "zh_points", "en_points", "importance", "deadline", "action"):
        out[k] = e.get(k)
    out["action"] = out["action"] or None
    out["drop"] = e.get("drop") is True
    return out


def check_items(items, pending, lenient):
    errs, warns, out = [], [], []
    pend = {p["id"]: p for p in pending}
    got = set()
    if not isinstance(items, list):
        return [], ["\"items\" must be a list"], []
    for k, e in enumerate(items):
        if not isinstance(e, dict):
            errs.append(f"items[{k}]: not an object")
            continue
        i = e.get("id")
        if i not in pend:
            errs.append(f"items[{k}]: id {i!r} is not in the pending file; never invent ids")
            continue
        if i in got:
            errs.append(f"{i}: appears more than once")
            continue
        got.add(i)
        p = pend[i]
        check_fields(e, i, errs, warns, lenient)
        src = norm(p["title"] + " " + (p.get("excerpt") or ""))
        dl = e.get("deadline")
        if not e.get("drop") and isinstance(dl, str) and DATE.match(dl):
            d = date.fromisoformat(dl)
            if not mentions_date(src, d, year=False):
                msg = f"{i}: deadline {dl} is not stated in the title/excerpt; set it to null"
                if lenient:
                    warns.append(msg + " (auto-fixed)")
                    e["deadline"] = None
                else:
                    errs.append(msg)
        if not e.get("drop"):
            bad = unsupported_numbers([e.get("zh_title") or "", e.get("zh_points") or "", e.get("en_points") or "",
                                       e.get("action") or ""], numbers(src))
            if bad:
                warns.append(f"{i}: numbers not in the excerpt: {', '.join(bad)}")
        out.append(entry(p, e))
    for i, p in pend.items():
        if i not in got:
            errs.append(f"{i}: missing; every pending id must appear exactly once (title: {p['title'][:80]})")
    return out, errs, warns


def verify_extra(e, day, known, pend_titles):
    """Returns (entry, image, None) or (None, None, reason)."""
    errs, warns = [], []
    check_fields(e, "extra", errs, warns, True)
    if e.get("drop"):
        return None, None, "drop=true"
    if errs:
        return None, None, "; ".join(errs)
    url = e.get("url") if isinstance(e.get("url"), str) else ""
    if not url.startswith("https://"):
        return None, None, "url must start with https://"
    url = clean_url(url)
    host = urlsplit(url).hostname or ""
    if not any(host == d or host.endswith("." + d) for d in EXTRA_DOMAINS):
        return None, None, f"domain {host} is not on the allowed list"
    i = item_id(url)
    if i in known:
        return None, None, "already in the digest or seen before"
    title = e.get("title") if isinstance(e.get("title"), str) else ""
    for t in pend_titles:
        if overlap(title, t) >= 0.7:
            return None, None, f"same story as RSS item: {t[:70]}"
    try:
        status, ct, page = fetch(url)
    except Exception as x:
        return None, None, f"fetch failed: {type(x).__name__} {str(x)[:80]}"
    if status != 200 or "html" not in ct:
        return None, None, f"HTTP {status} {ct}"
    titles = page_titles(page)
    best = max((overlap(title, t) for t in titles), default=0)
    if best < 0.6:
        return None, None, f"title does not match page (page: {titles[0][:80] if titles else '?'})"
    text = page_text(page)
    ev = e.get("evidence") if isinstance(e.get("evidence"), str) else ""
    if len(ev) < 30:
        return None, None, "evidence sentence missing or shorter than 30 chars"
    if not has_quote(ev, text):
        return None, None, "evidence sentence not found on the page"
    pub = str(e.get("published") or "")[:10]
    if not DATE.match(pub):
        return None, None, "published must be YYYY-MM-DD"
    pd = date.fromisoformat(pub)
    m = re.search(r"/(20\d\d)[/-](\d\d)(?:[/-](\d\d))?(?=/|$)", urlsplit(url).path)
    if m and (int(m[1]), int(m[2])) != (pd.year, pd.month) or m and m[3] and int(m[3]) != pd.day:
        return None, None, f"published {pub} contradicts the date in the URL"
    metas = page_dates(page)
    if metas and not any(abs((m - pd).days) <= 1 for m in metas):
        pd = metas[0]  # page metadata wins
    elif not metas and not mentions_date(text, pd):
        return None, None, f"date {pub} is not printed on the page"
    today = date.fromisoformat(day)
    if not today - timedelta(days=EXTRA_WINDOW_DAYS) <= pd <= today:
        return None, None, f"published {pd} is outside the last {EXTRA_WINDOW_DAYS} days"
    dl = e.get("deadline")
    if dl and not mentions_date(text, date.fromisoformat(dl), year=False):
        e["deadline"] = None
    og = meta(page, "og:title")
    base = {"id": i, "title": og[0] if og and overlap(title, og[0]) >= 0.6 else title, "url": url,
            "source": (e.get("source") or host).strip()[:60], "published": pd.isoformat()}
    out = entry(base, e)
    out["via"] = "gemini"
    img = (meta(page, "og:image") or [None])[0]
    return out, img, None


def check_extras(extras, day, known, pend_titles):
    acc, rej, imgs = [], [], {}
    if not isinstance(extras, list):
        return acc, [("extras", "must be a list")], imgs
    for k, e in enumerate(extras):
        label = (e.get("url") if isinstance(e, dict) else None) or f"extras[{k}]"
        if k >= MAX_EXTRAS:
            rej.append((label, f"over the limit of {MAX_EXTRAS}"))
            continue
        if not isinstance(e, dict):
            rej.append((label, "not an object"))
            continue
        out, img, why = verify_extra(e, day, known, pend_titles)
        if why:
            rej.append((label, why))
            continue
        known.add(out["id"])
        acc.append(out)
        if img:
            imgs[out["id"]] = img
    return acc, rej, imgs


def run(cmd):
    print("$ " + " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode:
        sys.exit(f"step failed ({r.returncode}): {' '.join(cmd)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inbox")
    ap.add_argument("--day", help="YYYY-MM-DD, default from the file name")
    ap.add_argument("--check", action="store_true", help="validate only")
    ap.add_argument("--lenient", action="store_true", help="auto-fix soft problems instead of failing")
    ap.add_argument("--extras-only", action="store_true", help="submit only verified extras (day already judged)")
    ap.add_argument("--no-publish", action="store_true", help="skip publish.ps1")
    a = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")
    inbox = Path(a.inbox).resolve()
    day = a.day or inbox.name[:10]
    errfile = inbox.with_suffix(".errors.txt")
    try:
        doc = json.loads(inbox.read_text("utf-8-sig"))
    except Exception as x:
        errfile.write_text(f"The file is not valid JSON: {x}\n", "utf-8")
        print(f"UNREADABLE {inbox}: {x}")
        sys.exit(2)
    if not isinstance(doc, dict):
        errfile.write_text("Top level must be an object {date, items, extras}\n", "utf-8")
        sys.exit(2)

    pend_path = ROOT / "data" / "pending" / f"{day}.json"
    pending = json.loads(pend_path.read_text("utf-8")) if pend_path.exists() else []
    errs, warns, items = [], [], []
    if doc.get("date") != day:
        errs.append(f"date must be \"{day}\", got {doc.get('date')!r}")
    if not a.extras_only:
        items, e2, w2 = check_items(doc.get("items"), pending, a.lenient)
        errs += e2
        warns += w2

    seen_path = ROOT / "data" / "seen.json"
    known = set(json.loads(seen_path.read_text("utf-8"))) if seen_path.exists() else set()
    known |= {p["id"] for p in pending}
    for f in (ROOT / "data" / "digest").glob(f"{day}*.json"):
        known |= {x["id"] for x in json.loads(f.read_text("utf-8"))}
    extras, rejected, imgs = check_extras(doc.get("extras") or [], day, known, [p["title"] for p in pending])

    kept = [x for x in items if not x["drop"]]
    high = sum(type(x["importance"]) is int and x["importance"] >= 4 for x in kept)
    print(f"items {len(items)}/{len(pending)}  kept {len(kept)}  importance>=4 {high}"
          f"  extras accepted {len(extras)} rejected {len(rejected)}")
    for x in extras:
        print(f"  + extra {x['importance']} {x['zh_title']} | {x['url']}")
    for u, why in rejected:
        print(f"  - extra rejected: {why} | {u}")
    for w in warns[:40]:
        print(f"  warn: {w}")
    if errs:
        errfile.write_text("\n".join(errs) + "\n", "utf-8")
        print(f"INVALID: {len(errs)} error(s), see {errfile}")
        for x in errs[:30]:
            print("  " + x)
        sys.exit(3)
    if errfile.exists():
        errfile.unlink()
    if a.check:
        print("check ok")
        return

    entries = extras if a.extras_only else items + extras
    if not entries:
        print("nothing to submit")
        return
    ddir = ROOT / "data" / "digest"
    names = [f"{day}.json"] + [f"{day}-g{'' if k == 1 else k}.json" for k in range(1, 20)]
    out = next(ddir / n for n in names if not (ddir / n).exists())
    out.write_text(json.dumps(entries, ensure_ascii=False, indent=1), "utf-8")
    print(f"wrote {out}")
    if imgs:
        n, got = images.update(ROOT / "data" / "images.json", imgs)
        print(f"images: resolved {got}/{n} new")
    run([sys.executable, "scripts/build.py"])
    run([sys.executable, "scripts/apply_actions.py", day])
    if not a.no_publish:
        run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/publish.ps1", "-Day", day])


if __name__ == "__main__":
    main()
