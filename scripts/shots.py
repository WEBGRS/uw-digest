"""Screenshot the local site (desktop + mobile) and report console errors."""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8820/"
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for name, vp in (("desktop", {"width": 1280, "height": 900}), ("mobile", {"width": 390, "height": 844})):
        pg = b.new_context(viewport=vp, locale="en-US").new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_selector(".item")
        over = pg.evaluate("document.documentElement.scrollWidth > innerWidth")
        pg.screenshot(path=f"shots/{name}-top.png")
        pg.locator("#subscribe").scroll_into_view_if_needed()
        pg.screenshot(path=f"shots/{name}-sub.png")
        print(name, "overflow:", over, "errors:", errs)
    b.close()
