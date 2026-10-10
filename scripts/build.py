"""Validate judged digests, mark items seen, build site/data/digest.json."""
import json, re, sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATS = set(json.loads((ROOT / "scripts" / "sources.json").read_text("utf-8"))["categories"])
KEEP_DAYS = 60
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def load(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def validate(entries, pending_ids=None):
    errs = []
    for e in entries:
        i = e.get("id", "?")
        if not re.match(r"^https://|^http://", e.get("url", "")):
            errs.append(f"{i}: bad url")
        if e.get("category") not in CATS:
            errs.append(f"{i}: bad category {e.get('category')}")
        if e.get("importance") not in (1, 2, 3, 4, 5):
            errs.append(f"{i}: bad importance")
        if not e.get("zh_title") or not e.get("zh_points") or not e.get("en_points"):
            errs.append(f"{i}: missing zh/en fields")
        if e.get("deadline") and not DATE.match(str(e["deadline"])):
            errs.append(f"{i}: bad deadline")
        if pending_ids is not None and i not in pending_ids:
            errs.append(f"{i}: id not in pending")
    return errs


def main():
    seen_path = ROOT / "data" / "seen.json"
    seen = load(seen_path, {})
    for f in sorted((ROOT / "data" / "digest").glob("*.json")):
        day = f.stem[:10]
        entries = json.loads(f.read_text("utf-8"))
        pend = load(ROOT / "data" / "pending" / f"{day}.json", None)
        errs = validate(entries)
        if errs:
            print(f"INVALID {f.name}:\n  " + "\n  ".join(errs[:20]), file=sys.stderr)
            sys.exit(1)
        for e in entries:
            seen[e["id"]] = day
        if pend is not None:  # items the judge dropped count as seen too
            for x in pend:
                seen.setdefault(x["id"], day)
    seen_path.write_text(json.dumps(seen), "utf-8")

    cutoff = (datetime.now() - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    # Several runs on one day (<date>.json, <date>-r2.json) merge by id
    by_day = {}
    for f in sorted((ROOT / "data" / "digest").glob("*.json")):
        day = f.stem[:10]
        if day < cutoff:
            continue
        for e in json.loads(f.read_text("utf-8")):
            if not e.get("drop"):
                by_day.setdefault(day, {})[e["id"]] = e
    days = []
    for day in sorted(by_day, reverse=True):
        items = sorted(by_day[day].values(), key=lambda e: -e["importance"])
        days.append({"date": day, "items": items})
    cfg = json.loads((ROOT / "scripts" / "sources.json").read_text("utf-8"))
    out = {"generated": datetime.now().isoformat(timespec="seconds"),
           "categories": cfg["categories"], "categories_zh": cfg["categories_zh"], "days": days}
    dest = ROOT / "site" / "data"
    dest.mkdir(exist_ok=True)
    (dest / "digest.json").write_text(json.dumps(out, ensure_ascii=False), "utf-8")
    print(f"built {sum(len(d['items']) for d in days)} items over {len(days)} days")


if __name__ == "__main__":
    main()
