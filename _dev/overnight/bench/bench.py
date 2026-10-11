"""Measure the garden's moves between pages (and board view) for smoothness and cost.

    .venv/bin/python bench.py LABEL [--board small|n150|n400] [--cpu 1|4] [--runs 3] [--browser chromium]

Each run starts a fresh browser, opens the garden at Home, waits for it to settle, then
makes a fixed set of moves (by changing the address, as Back/Forward and links do), and
for each records, from the start of the move until the board is back and still:

  frames, fps        requestAnimationFrame callbacks in the top page, and their rate
  dropped            frames missed against 60 Hz (a 50 ms gap counts as 2 dropped)
  worst, p95         the longest and 95th-percentile gaps between frames (ms)
  long               tasks over 50 ms (Long Tasks API, Chromium)
  main               main-thread busy time (CDP Performance.getMetrics TaskDuration, ms)
  cpu                CPU time of every browser process (renderer, GPU, raster...), from /proc (ms)

plus, once per run: how long the garden takes to start, memory (JS heap and the
browser's total PSS) and CPU used while sitting idle on a page and in board view.
--cpu 4 slows the page's main thread 4x (CDP), standing in for a phone.
Results go in runs/LABEL-BOARD-cpuN-BROWSER.json; a short summary is printed.
"""
import argparse
import asyncio
import hashlib
import json
import os
import pathlib
import re
import statistics
import time

from playwright.async_api import async_playwright

from serve import serve

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "out" / "cache"
TICK = os.sysconf("SC_CLK_TCK")

# Frame timing and long tasks, in the top page only
INSTRUMENT = """
if (window.top === window) {
    const B = window.__bench = { recording: false, frames: [], longtasks: [], shifts: 0 };
    B.start = () => {
        B.frames = []; B.longtasks = []; B.shifts = 0; B.recording = true;
        const loop = t => { if (!B.recording) return; B.frames.push(t); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    };
    B.stop = () => { B.recording = false; return { frames: B.frames, longtasks: B.longtasks, shifts: B.shifts }; };
    try {
        new PerformanceObserver(l => { if (B.recording) for (const e of l.getEntries()) B.longtasks.push(e.duration); })
            .observe({ type: 'longtask' });
    } catch (e) {}
    try {
        new PerformanceObserver(l => { if (B.recording) for (const e of l.getEntries()) if (!e.hadRecentInput) B.shifts += e.value; })
            .observe({ type: 'layout-shift' });
    } catch (e) {}
    // Still: no move under way, the page shown, no title in flight
    B.settled = () => {
        const board = document.getElementById('board'), page = document.getElementById('page');
        if (!board || document.body.classList.contains('booting')) return false;
        if (board.classList.contains('flying') || board.classList.contains('covered')) return false;
        if (document.getElementById('morph').childElementCount) return false;
        if (board.classList.contains('free')) return !document.getElementById('board-hint').hidden;
        return page.classList.contains('shown') && !!document.querySelector('.card.arrived');
    };
}
"""


def proc_tree(root):
    """Pids of root and all its descendants."""
    children = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            stat = open(f"/proc/{d}/stat").read()
        except OSError:
            continue
        ppid = int(stat.rsplit(")", 1)[1].split()[1])
        children.setdefault(ppid, []).append(int(d))
    out, todo = [], [root]
    while todo:
        p = todo.pop()
        out.append(p)
        todo += children.get(p, [])
    return out


def cpu_ms():
    total = 0
    for p in proc_tree(os.getpid())[1:]:
        try:
            f = open(f"/proc/{p}/stat").read().rsplit(")", 1)[1].split()
            total += int(f[11]) + int(f[12])          # utime + stime
        except (OSError, IndexError):
            pass
    return total * 1000 / TICK


def pss_mb():
    total = 0
    for p in proc_tree(os.getpid())[1:]:
        try:
            for line in open(f"/proc/{p}/smaps_rollup"):
                if line.startswith("Pss:"):
                    total += int(line.split()[1])
        except OSError:
            pass
    return total / 1024


def frame_stats(frames):
    gaps = [b - a for a, b in zip(frames, frames[1:])]
    if not gaps:
        return {"frames": len(frames), "fps": 0, "dropped": 0, "worst": 0, "p95": 0}
    span = frames[-1] - frames[0]
    return {
        "frames": len(frames),
        "fps": round((len(frames) - 1) / span * 1000, 1) if span else 0,
        "dropped": sum(max(0, round(g / (1000 / 60)) - 1) for g in gaps),
        "worst": round(max(gaps), 1),
        "p95": round(sorted(gaps)[int(len(gaps) * 0.95)], 1),
    }


# Anything the browser itself tries to fetch from outside (not just the pages) goes to a
# proxy that doesn't exist; only the local server is reached directly
NO_NETWORK = {"server": "http://127.0.0.1:9", "bypass": "127.0.0.1,localhost"}
LOCAL = re.compile(r"^(https?|wss?)://(127\.0\.0\.1|localhost)(:\d+)?/")
blocked = set()


async def cached_route(route):
    """Nothing leaves this machine: requests to the local server go through; outside files
    (Google Fonts, d3, Font Awesome) are served from the copies saved in out/cache on the
    first runs, and anything not saved there is blocked. The same files every run."""
    url = route.request.url
    if LOCAL.match(url) or url.startswith(("data:", "blob:")):
        return await route.continue_()
    key = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if not key.exists() or not key.with_suffix(".json").exists():
        blocked.add(url.split("?")[0])
        return await route.abort("blockedbyclient")
    meta = json.loads(key.with_suffix(".json").read_text())
    headers = {k: v for k, v in meta["headers"].items() if k.lower() in ("content-type", "access-control-allow-origin")}
    headers["access-control-allow-origin"] = "*"
    await route.fulfill(status=meta["status"], headers=headers, body=key.read_bytes())


async def metrics(cdp):
    if not cdp:
        return {}
    m = await cdp.send("Performance.getMetrics")
    return {x["name"]: x["value"] for x in m["metrics"]}


async def measure(page, cdp, action, tail_ms=700):
    """Run action, then record until the garden is still again (plus tail_ms, which
    catches the board coming back under the page)."""
    await page.evaluate("__bench.start()")
    m0, c0, t0 = await metrics(cdp), cpu_ms(), time.perf_counter()
    await page.evaluate(action)
    await page.wait_for_timeout(50)
    await page.wait_for_function("__bench.settled()", polling=50, timeout=15000)
    await page.wait_for_timeout(tail_ms)
    rec = await page.evaluate("__bench.stop()")
    m1, c1 = await metrics(cdp), cpu_ms()
    out = frame_stats(rec["frames"])
    out.update({
        "ms": round((time.perf_counter() - t0) * 1000),
        "long": len(rec["longtasks"]), "long_ms": round(sum(rec["longtasks"])),
        "shift": round(rec["shifts"], 4),
        "cpu": round(c1 - c0),
    })
    if m0:
        out["main"] = round((m1["TaskDuration"] - m0["TaskDuration"]) * 1000)
        out["layout"] = round((m1["LayoutDuration"] - m0["LayoutDuration"]) * 1000)
        out["style"] = round((m1["RecalcStyleDuration"] - m0["RecalcStyleDuration"]) * 1000)
        out["script"] = round((m1["ScriptDuration"] - m0["ScriptDuration"]) * 1000)
    return out


async def idle(page, cdp, ms=3000):
    m0, c0 = await metrics(cdp), cpu_ms()
    await page.wait_for_timeout(ms)
    m1, c1 = await metrics(cdp), cpu_ms()
    out = {"cpu": round(c1 - c0)}
    if m0:
        out["main"] = round((m1["TaskDuration"] - m0["TaskDuration"]) * 1000)
    return out


def route_for(nodes):
    """The moves to make: neighbours, across the board, into board view and out."""
    by = {n["id"]: n for n in nodes}
    notes = [n for n in nodes if n.get("kind") == "Note"]
    projects = [n for n in nodes if n.get("kind") == "Project"]
    far_note = max(notes, key=lambda n: (n.get("project") or "", n["date"])) if notes else None
    hops = [("neighbour", by["portfolio"]), ("project", projects[0])]
    if far_note:
        hops.append(("across", far_note))
    hops += [("timeline", by["notes"]), ("mid-project", projects[len(projects) // 2]), ("home", by["home"])]
    return hops


async def run_once(p, args, base):
    # Chromium headless draws with a software GPU unless told to use the real one
    gpu = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"]
    # WebKit on Fedora needs Ubuntu's libraries: WEBKIT_EXE names a launcher that adds them
    exe = os.environ.get("WEBKIT_EXE") if args.browser == "webkit" else None
    browser = await getattr(p, args.browser).launch(args=gpu if args.browser == "chromium" and not args.swgl else [],
                                                    executable_path=exe, proxy=NO_NETWORK)
    ctx = await browser.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=1, service_workers="block")
    await ctx.route("**/*", cached_route)
    await ctx.add_init_script(INSTRUMENT)
    if args.css:            # an experiment: extra CSS in the garden page
        await ctx.add_init_script("if (window.top === window) addEventListener('DOMContentLoaded', () => "
                                  "document.head.append(Object.assign(document.createElement('style'), { textContent: %s })))" % json.dumps(args.css))
    page = await ctx.new_page()
    cdp = None
    if args.browser == "chromium":
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Performance.enable")
        if args.cpu > 1:
            await cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu})
    result = {"moves": []}
    page.on("pageerror", lambda e: print("page error:", str(e)[:200]))
    t0 = time.perf_counter()
    await page.goto(base + "/garden/", wait_until="load")
    await page.wait_for_function("window.__bench && __bench.settled()", polling=100, timeout=60000)
    result["boot_ms"] = round((time.perf_counter() - t0) * 1000)
    await page.wait_for_timeout(2500)               # cards' live copies load, first snapshot
    nodes = await page.evaluate("JSON.parse(document.getElementById('garden-data').textContent)")
    nodes = nodes["pages"] + nodes["notes"]
    only = args.only.split(",") if args.only else None
    for name, n in route_for(nodes):
        if only and name not in only:
            continue
        path = n["url"] if n["url"].startswith("/") else "/" + n["url"]
        r = await measure(page, cdp, f"location.hash = {json.dumps('#' + path)}")
        r["move"] = name
        result["moves"].append(r)
        await page.wait_for_timeout(1500)           # read the page a moment (its snapshot is taken)
    # The page's snapshot for its card is taken 1.2 s after it settles, once the browser
    # is idle, and can take over a second: wait it out, or it's counted as idle CPU
    await page.wait_for_timeout(4000)
    result["idle_page"] = await idle(page, cdp)
    r = await measure(page, cdp, "document.getElementById('board-toggle').click()")
    r["move"] = "board-out"
    result["moves"].append(r)
    await page.wait_for_timeout(500)
    result["idle_board"] = await idle(page, cdp)
    r = await measure(page, cdp, "document.getElementById('board-toggle').click()")
    r["move"] = "board-in"
    result["moves"].append(r)
    m = await metrics(cdp)
    result["heap_mb"] = round(m.get("JSHeapUsedSize", 0) / 2**20, 1)
    result["nodes"] = int(m.get("Nodes", 0))
    result["pss_mb"] = round(pss_mb())
    await browser.close()
    return result


def summarise(runs):
    """Medians across runs of each move's numbers, and of the totals."""
    keys = ["frames", "fps", "dropped", "worst", "p95", "long", "long_ms", "main", "cpu", "style", "layout", "script", "shift"]
    med = lambda xs: round(statistics.median(xs), 1) if xs else None
    moves = {}
    for i, mv in enumerate(runs[0]["moves"]):
        moves[mv["move"]] = {k: med([r["moves"][i][k] for r in runs if k in r["moves"][i]]) for k in keys}
    flights = [mv for r in runs for mv in r["moves"]]
    total = {
        "dropped/move": med([sum(m["dropped"] for m in r["moves"]) / len(r["moves"]) for r in runs]),
        "worst": med([max(m["worst"] for m in r["moves"]) for r in runs]),
        "fps": med([m["fps"] for m in flights]),
        "main/move": med([sum(m.get("main", 0) for m in r["moves"]) / len(r["moves"]) for r in runs]),
        "cpu/move": med([sum(m["cpu"] for m in r["moves"]) / len(r["moves"]) for r in runs]),
        "long/move": med([sum(m["long"] for m in r["moves"]) / len(r["moves"]) for r in runs]),
        "boot_ms": med([r["boot_ms"] for r in runs]),
        "idle_page_cpu": med([r["idle_page"]["cpu"] for r in runs]),
        "idle_board_cpu": med([r["idle_board"]["cpu"] for r in runs]),
        "heap_mb": med([r["heap_mb"] for r in runs]),
        "pss_mb": med([r["pss_mb"] for r in runs]),
    }
    return {"moves": moves, "total": total}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("--board", default="small")
    ap.add_argument("--cpu", type=int, default=1)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--browser", default="chromium")
    ap.add_argument("--css", help="extra CSS for the garden page, for quick experiments")
    ap.add_argument("--only", help="comma-separated moves to make (default: all)")
    ap.add_argument("--swgl", action="store_true", help="Chromium: software GPU (SwiftShader) instead of the real one")
    args = ap.parse_args()
    server, base = serve(args.board)
    runs = []
    async with async_playwright() as p:
        for _ in range(args.runs):
            runs.append(await run_once(p, args, base))
    server.shutdown()
    summary = summarise(runs)
    out = HERE / "runs" / f"{args.label}-{args.board}-cpu{args.cpu}-{args.browser}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"args": vars(args), "summary": summary, "runs": runs}, indent=1))
    if blocked:
        print("blocked (no local copy):", ", ".join(sorted(blocked)))
    print(f"{args.label} {args.board} cpu{args.cpu} {args.browser}: " + "  ".join(f"{k}={v}" for k, v in summary["total"].items()))
    for name, mv in summary["moves"].items():
        print(f"  {name:12} " + " ".join(f"{k}={v}" for k, v in mv.items() if v is not None))


if __name__ == "__main__":
    asyncio.run(main())
