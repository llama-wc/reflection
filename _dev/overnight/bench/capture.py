"""Film the garden's moves frame by frame, to compare two versions by eye.

Records the frames Chromium actually draws (its screencast), named by milliseconds
since the move began. (Chromium's virtual time would film both versions at identical
moments, but its screenshots stall while a page loads into the garden's frame.)

    .venv/bin/python capture.py OUT_DIR --root SITE_COPY --boards BOARDS_DIR [--board small]

SITE_COPY is a copy of the site (see run.sh), BOARDS_DIR the boards build.py made for
it. Frames go in OUT_DIR/<move>/NNNN.jpg (half size), with the virtual time in ms.
"""
import argparse
import asyncio
import base64
import functools
import http.server
import json
import os
import pathlib
import threading

from playwright.async_api import async_playwright

from bench import INSTRUMENT, NO_NETWORK, cached_route

class Handler(http.server.SimpleHTTPRequestHandler):
    root = overlay = None

    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def translate_path(self, path):
        rel = pathlib.Path(super().translate_path(path)).relative_to(self.root)
        for base in (self.overlay, self.root):
            p = base / rel
            if p.is_dir() and (p / "index.html").exists():
                return str(p / "index.html")
            if p.is_file():
                return str(p)
        return str(self.root / rel)


def serve(root, overlay):
    h = type("H", (Handler,), {"root": root, "overlay": overlay})
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(h, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def moves_for(nodes):
    by = {n["id"]: n for n in nodes}
    notes = [n for n in nodes if n.get("kind") == "Note"]
    projects = [n for n in nodes if n.get("kind") == "Project"]
    far = max(notes, key=lambda n: (n.get("project") or "", n["date"])) if notes else None
    hops = [("1-neighbour", by["portfolio"]), ("2-project", projects[0])]
    if far:
        hops.append(("3-across", far))
    hops += [("4-timeline", by["notes"]), ("5-home", by["home"])]
    return hops


async def film(page, cdp, out, action, ms):
    """Record the frames the browser draws, as it draws them, for ms after action."""
    out.mkdir(parents=True, exist_ok=True)
    t0 = None
    def frame(e):
        nonlocal t0
        asyncio.ensure_future(cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]}))
        ts = e["metadata"]["timestamp"]
        if t0 is None:
            return
        (out / f"{round((ts - t0) * 1000):05d}.jpg").write_bytes(base64.b64decode(e["data"]))
    cdp.on("Page.screencastFrame", frame)
    await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 70, "maxWidth": 700, "maxHeight": 450, "everyNthFrame": 1})
    await page.wait_for_timeout(300)
    t0 = await page.evaluate("Date.now() / 1000")
    await page.evaluate(action)
    await page.wait_for_timeout(ms)
    await cdp.send("Page.stopScreencast")
    cdp.remove_listener("Page.screencastFrame", frame)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--root", required=True)
    ap.add_argument("--boards", required=True)
    ap.add_argument("--board", default="small")
    ap.add_argument("--ms", type=int, default=1600, help="how long to film each move")
    ap.add_argument("--size", default="1400x900", help="window size, e.g. 1920x1080")
    ap.add_argument("--theme", choices=("dark", "light"), help="the site's theme (default: the site's own default)")
    args = ap.parse_args()
    root = pathlib.Path(args.root).resolve()
    server, base = serve(root, pathlib.Path(args.boards).resolve() / args.board)
    out = pathlib.Path(args.out)
    gpu = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"]
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=gpu, proxy=None if os.environ.get("CAPTURE_LIVE") else NO_NETWORK)
        ctx = await browser.new_context(viewport=dict(zip(("width", "height"), map(int, args.size.split("x")))), device_scale_factor=1, service_workers="block")
        if not os.environ.get("CAPTURE_LIVE"):
            await ctx.route("**/*", cached_route)
        await ctx.add_init_script(INSTRUMENT)
        if args.theme:
            await ctx.add_init_script(f"try {{ localStorage.setItem('portfolio-theme', '{args.theme}') }} catch (e) {{}}")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("page error:", str(e)[:200]))
        cdp = await ctx.new_cdp_session(page)
        await page.goto(base + "/garden/", wait_until="load")
        await page.wait_for_function("window.__bench && __bench.settled()", polling=100, timeout=120000)
        await page.wait_for_timeout(6000)     # cards' live copies and Home's snapshot
        data = await page.evaluate("JSON.parse(document.getElementById('garden-data').textContent)")
        for name, n in moves_for(data["pages"] + data["notes"]):
            path = n["url"] if n["url"].startswith("/") else "/" + n["url"]
            await film(page, cdp, out / name, f"location.hash = {json.dumps('#' + path)}", args.ms)
            await page.wait_for_timeout(4000)     # the page settles and its snapshot is taken
        for name in ("6-board-out", "7-board-in"):
            await film(page, cdp, out / name, "document.getElementById('board-toggle').click()", args.ms)
            await page.wait_for_timeout(2000)
        await browser.close()
    server.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
