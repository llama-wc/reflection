"""What a page's snapshot costs, on a first visit and on a return visit.

For each page with a snapshot (the app pages), open it, then go Home and come back.
After each landing, record the browser's CPU for 6 s (long enough for the snapshot to
be taken) and whether a new snapshot was stored:

    .venv/bin/python snapcost.py LABEL [--board small] [--runs 3]

Serves the tree named by BENCH_ROOT, like bench.py, and is just as offline.
"""
import argparse
import asyncio
import json
import statistics

from playwright.async_api import async_playwright

from bench import HERE, INSTRUMENT, NO_NETWORK, cached_route, cpu_ms
from serve import serve

STORED = """async (key) => {
    const db = await new Promise(r => { const q = indexedDB.open('garden', 1); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
    if (!db) return null;
    return await new Promise(r => {
        try {
            const q = db.transaction('snapshots').objectStore('snapshots').get(key);
            q.onsuccess = () => r(q.result ? q.result.at : null); q.onerror = () => r(null);
        } catch (e) { r(null); }
    });
}"""


async def land(page, path):
    await page.evaluate(f"location.hash = {json.dumps('#' + path)}")
    await page.wait_for_timeout(50)
    await page.wait_for_function("__bench.settled()", polling=50, timeout=15000)


async def visit(page, n, theme):
    path = n["url"] if n["url"].startswith("/") else "/" + n["url"]
    before = await page.evaluate(STORED, f"{n['id']}|{theme}")
    await land(page, path)
    c0 = cpu_ms()
    await page.wait_for_timeout(6000)
    cpu = round(cpu_ms() - c0)
    after = await page.evaluate(STORED, f"{n['id']}|{theme}")
    return {"cpu": cpu, "snapped": after is not None and after != before}


async def run_once(p, base):
    gpu = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"]
    browser = await p.chromium.launch(args=gpu, proxy=NO_NETWORK)
    ctx = await browser.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=1, service_workers="block")
    await ctx.route("**/*", cached_route)
    await ctx.add_init_script(INSTRUMENT)
    page = await ctx.new_page()
    page.on("pageerror", lambda e: print("page error:", str(e)[:200]))
    await page.goto(base + "/garden/", wait_until="load")
    await page.wait_for_function("window.__bench && __bench.settled()", polling=100, timeout=60000)
    await page.wait_for_timeout(6000)              # Home's own first snapshot
    theme = await page.evaluate("document.documentElement.dataset.theme || 'dark'")
    data = await page.evaluate("JSON.parse(document.getElementById('garden-data').textContent)")
    home = next(n for n in data["pages"] if n["id"] == "home")
    out = {}
    for n in data["pages"]:
        if not n.get("thumb") or n["id"] == "home":
            continue
        first = await visit(page, n, theme)
        await visit(page, home, theme)
        again = await visit(page, n, theme)
        out[n["id"]] = {"first": first, "again": again}
    await browser.close()
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("--board", default="small")
    ap.add_argument("--runs", type=int, default=3)
    args = ap.parse_args()
    server, base = serve(args.board)
    async with async_playwright() as p:
        runs = [await run_once(p, base) for _ in range(args.runs)]
    server.shutdown()
    (HERE / "runs" / f"snapcost-{args.label}-{args.board}.json").write_text(json.dumps(runs, indent=1))
    print(f"{args.label} ({args.board}, median of {args.runs}): CPU in the 6 s after landing, ms (* = new snapshot stored)")
    for pid in runs[0]:
        cells = []
        for visit_ in ("first", "again"):
            vals = [r[pid][visit_] for r in runs]
            snapped = sum(v["snapped"] for v in vals)
            cells.append(f"{visit_} {statistics.median(v['cpu'] for v in vals):6.0f}{'*' * snapped:3}")
        print(f"  {pid:22} " + "   ".join(cells))


if __name__ == "__main__":
    asyncio.run(main())
