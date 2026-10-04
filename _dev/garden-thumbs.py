"""Capture the board's page pictures (garden/thumbs/<id>-<theme>.jpg).

The five app pages show a screenshot on their card (with the heading hidden, since
the card draws the heading itself); notes show a live copy
instead, so they never need one. Re-run this after changing one of these pages:

    python3 _dev/garden-thumbs.py          (needs Playwright: pip install playwright && playwright install firefox)

It serves the repo locally, opens each page in both themes at the size a page
appears on the board, and saves a compressed JPEG.
"""
import asyncio
import functools
import http.server
import json
import pathlib
import threading

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "garden" / "thumbs"
WIDTH, HEIGHT = 1400, 848          # the visible page area on the board (16:9.7)
PAGES = {
    "home": "/",
    "portfolio": "/portfolio.html",
    "movie-dashboard": "/movie-reviews.html",
    "virtue-ledger": "/ledger/",
    "elenchus": "/elenchus/",
}
SETTLE_MS = {"movie-dashboard": 6000}   # wait for the charts to draw
TITLES = ROOT / "_data" / "garden_titles.json"

# Where each page's heading sits and how it looks, so a card can draw it.
HEADING_JS = """() => {
    const h = document.querySelector('h1');
    const r = h.getBoundingClientRect(), cs = getComputedStyle(h);
    const range = document.createRange(); range.selectNodeContents(h);
    const textRight = range.getBoundingClientRect().right;   // the words, not the (maybe wider) box
    const sides = ['top', 'right', 'bottom', 'left'];
    const props = ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'line-height', 'color',
        'white-space', 'text-align', 'text-wrap', 'word-spacing', ...sides.map(s => `padding-${s}`),
        ...sides.flatMap(s => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`])];
    return {
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        textWidth: textRight - r.left,
        lines: h.innerText.split('\\n'),
        style: Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)])),
    };
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    titles = {}
    server = serve()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    async with async_playwright() as p:
        browser = await p.firefox.launch()
        for theme in ("dark", "light"):
            ctx = await browser.new_context(viewport={"width": WIDTH, "height": HEIGHT})
            await ctx.add_init_script(f"try {{ localStorage.setItem('portfolio-theme', '{theme}'); }} catch (e) {{}}")
            page = await ctx.new_page()
            for key, path in PAGES.items():
                await page.goto(base + path, wait_until="load")
                await page.wait_for_timeout(SETTLE_MS.get(key, 1500))
                # Record the page heading (the card draws it large itself), then hide it
                # so the screenshot doesn't show a second, smaller copy.
                titles.setdefault(key, {})[theme] = await page.evaluate(HEADING_JS)
                await page.evaluate("document.querySelector('h1').style.visibility = 'hidden'")
                target = OUT / f"{key}-{theme}.jpg"
                await page.screenshot(path=str(target), type="jpeg", quality=78)
                print(f"saved {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")
            await ctx.close()
        await browser.close()
    server.shutdown()
    TITLES.write_text(json.dumps(titles, indent=2) + "\n")
    print(f"saved {TITLES.relative_to(ROOT)}")


asyncio.run(main())
