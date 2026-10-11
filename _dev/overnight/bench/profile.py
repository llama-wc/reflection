"""Where the time goes in one move: a Chromium trace, summed by kind of work per thread.

    .venv/bin/python profile.py [--board n400] [--cpu 4] [--to /notes/] [--board-view]

Prints the busiest kinds of work on the page's main thread, the compositor and the
raster threads, and the GPU process, in ms over the move (not the raw trace).
"""
import argparse
import asyncio
import collections
import json
import pathlib

from playwright.async_api import async_playwright

from bench import INSTRUMENT, NO_NETWORK, cached_route
from serve import serve

HERE = pathlib.Path(__file__).resolve().parent
CATS = "devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,disabled-by-default-devtools.timeline,blink,cc,gpu,viz,v8.execute,benchmark,toplevel"
GPU = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"]


def summarise(trace, top=14):
    events = trace["traceEvents"] if isinstance(trace, dict) else trace
    names = {}
    for e in events:
        if e.get("ph") == "M" and e.get("name") == "thread_name":
            names[(e["pid"], e["tid"])] = e["args"]["name"]
    # Self time of complete events ('X'), per thread kind
    by_thread = collections.defaultdict(list)
    for e in events:
        if e.get("ph") == "X" and "dur" in e:
            by_thread[(e["pid"], e["tid"])].append(e)
    totals = collections.defaultdict(collections.Counter)
    for key, evs in by_thread.items():
        kind = names.get(key, "?")
        kind = "raster" if kind.startswith("CompositorTileWorker") else kind
        if kind not in ("CrRendererMain", "Compositor", "raster", "CrGpuMain", "VizCompositorThread"):
            continue
        evs.sort(key=lambda e: (e["ts"], -e["dur"]))
        stack = []
        for e in evs:
            while stack and stack[-1]["ts"] + stack[-1]["dur"] <= e["ts"]:
                stack.pop()
            if stack:
                stack[-1]["_child"] = stack[-1].get("_child", 0) + e["dur"]
            stack.append(e)
        for e in evs:
            totals[kind][e["name"]] += (e["dur"] - e.get("_child", 0)) / 1000
    for kind, c in totals.items():
        total = sum(c.values())
        print(f"{kind}: {total:.0f} ms  " + ", ".join(f"{n} {v:.0f}" for n, v in c.most_common(top) if v >= 1))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default="n400")
    ap.add_argument("--cpu", type=int, default=4)
    ap.add_argument("--to", default="/notes/")
    ap.add_argument("--board-view", action="store_true")
    ap.add_argument("--save")
    args = ap.parse_args()
    server, base = serve(args.board)
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=GPU, proxy=NO_NETWORK)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=1, service_workers="block")
        await ctx.route("**/*", cached_route)
        await ctx.add_init_script(INSTRUMENT)
        page = await ctx.new_page()
        cdp = await ctx.new_cdp_session(page)
        await page.goto(base + "/garden/", wait_until="load")
        await page.wait_for_function("window.__bench && __bench.settled()", polling=100, timeout=60000)
        await page.wait_for_timeout(3000)
        if args.cpu > 1:
            await cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
        await browser.start_tracing(page=page, categories=CATS.split(","))
        await page.evaluate("__bench.start()")
        action = "document.getElementById('board-toggle').click()" if args.board_view else f"location.hash = {json.dumps('#' + args.to)}"
        await page.evaluate(action)
        await page.wait_for_timeout(50)
        await page.wait_for_function("__bench.settled()", polling=50, timeout=20000)
        await page.wait_for_timeout(700)
        rec = await page.evaluate("__bench.stop()")
        raw = await browser.stop_tracing()
        await browser.close()
    server.shutdown()
    from bench import frame_stats
    print(frame_stats(rec["frames"]))
    trace = json.loads(raw)
    if args.save:
        pathlib.Path(args.save).write_bytes(raw)
    summarise(trace)


if __name__ == "__main__":
    asyncio.run(main())
