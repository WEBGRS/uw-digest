"""Append deadline items (importance>=4) from a judged digest to Documents/TODO.md."""
import re, sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TODO = Path(r"C:\Users\ghs\Documents\TODO.md")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main(day):
    entries = json.loads((ROOT / "data" / "digest" / f"{day}.json").read_text("utf-8"))
    text = TODO.read_text("utf-8")
    lines = []
    for e in entries:
        if e.get("drop") or e["importance"] < 4 or not e.get("deadline") or not DATE.match(e["deadline"]):
            continue
        tag = f"[NEWS-{e['id'][:6]}]"
        if tag in text:
            continue
        zh = re.sub(r"[\r\n|]+", " ", e.get("action") or e["zh_title"])[:80]
        en = re.sub(r"[\r\n|]+", " ", e["title"])[:90]
        lines.append(f"DEADLINE: {e['deadline']} | {tag} 【{zh}】{en} {e['url']}")
    if lines:
        with TODO.open("a", encoding="utf-8") as f:
            f.write("\n" + "\n".join(lines) + "\n")
        (ROOT / "data" / "actions" / f"{day}.md").write_text("\n".join(lines) + "\n", "utf-8")
    print(f"actions added: {len(lines)}")


if __name__ == "__main__":
    main(sys.argv[1])
