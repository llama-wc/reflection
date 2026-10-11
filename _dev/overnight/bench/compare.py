"""Check a change keeps the garden looking the same: screenshots of the same states from
two versions of the site, compared pixel by pixel in the browser.

    .venv/bin/python compare.py OLD_COMMIT [--board small] [--theme dark]

OLD_COMMIT is exported (git archive) to out/tree-OLD; the working tree is the new
version. States: Home at rest, board view at rest, and board view with the board
receded as in flight (#board.flying, put in place at once). For each, prints the share
of pixels that differ and the largest difference, and saves the pictures and a diff
image to out/compare/.
"""
import argparse
import asyncio
import base64
import importlib
import json
import os
import pathlib
import subprocess

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out" / "compare"

DIFF_JS = """async ([a, b]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height);
    let n = 0, worst = 0, sum = 0;
    for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db.data[i]), Math.abs(da[i+1] - db.data[i+1]), Math.abs(da[i+2] - db.data[i+2]));
        if (d > 2) n++;
        worst = Math.max(worst, d); sum += d;
        db.data[i] = db.data[i+1] = db.data[i+2] = Math.min(255, d * 8); db.data[i+3] = 255;
    }
    g.putImageData(db, 0, 0);
    return { share: n / (da.length / 4), worst, mean: sum / (da.length / 4), diff: c.toDataURL('image/png') };
}"""


async def shoot(root, board, theme, tag):
    # Each version gets test boards built from its own garden page
    os.environ["BENCH_ROOT"] = str(root)
    os.environ["BENCH_BOARDS"] = str(HERE / "out" / f"boards-{tag}")
    subprocess.run([str(HERE / ".venv" / "bin" / "python"), str(HERE / "build.py")], check=True, capture_output=True)
    import serve
    importlib.reload(serve)
    import bench
    server, base = serve.serve(board)
    shots = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"],
                                          proxy=bench.NO_NETWORK)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900}, service_workers="block", reduced_motion="no-preference")
        await ctx.route("**/*", bench.cached_route)
        await ctx.add_init_script(bench.INSTRUMENT)
        await ctx.add_init_script(f"try {{ localStorage.setItem('portfolio-theme', '{theme}'); }} catch (e) {{}}")
        page = await ctx.new_page()
        await page.goto(base + "/garden/")
        await page.wait_for_function("window.__bench && __bench.settled()", timeout=60000)
        await page.wait_for_timeout(6000)            # Home's own snapshot is taken, cards' pages load
        shots["home"] = await page.screenshot()
        await page.evaluate("document.getElementById('board-toggle').click()")
        await page.wait_for_function("__bench.settled()", timeout=20000)
        await page.mouse.move(5, 5)
        await page.wait_for_timeout(3000)
        shots["board"] = await page.screenshot()
        # The board receded, as in flight, without moving the camera
        await page.evaluate("document.getElementById('board').classList.add('flying', 'covered')")
        await page.wait_for_timeout(800)
        shots["receded"] = await page.screenshot()
        await browser.close()
    server.shutdown()
    for k, v in shots.items():
        (OUT / f"{k}-{theme}-{tag}.png").write_bytes(v)
    return shots


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("old")
    ap.add_argument("--board", default="small")
    ap.add_argument("--theme", default="dark")
    ap.add_argument("--new", help="compare with this commit instead of the working tree (OLD itself: the noise floor)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    repo = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    def export(commit):
        tree = HERE / "out" / f"tree-{commit}"
        if not tree.exists():
            tree.mkdir(parents=True)
            archive = subprocess.run(["git", "-C", str(repo), "archive", commit], check=True, capture_output=True).stdout
            subprocess.run(["tar", "-x", "-C", str(tree)], input=archive, check=True)
        return tree
    a = await shoot(export(args.old), args.board, args.theme, "old")
    b = await shoot(export(args.new) if args.new else repo, args.board, args.theme, "new")
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        for k in a:
            url = lambda png: "data:image/png;base64," + base64.b64encode(png).decode()
            r = await page.evaluate(DIFF_JS, [url(a[k]), url(b[k])])
            (OUT / f"{k}-{args.theme}-diff.png").write_bytes(base64.b64decode(r["diff"].split(",", 1)[1]))
            print(f"{k:9} {args.theme}: {r['share'] * 100:.2f}% of pixels differ, largest difference {r['worst']}, mean {r['mean']:.2f}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
