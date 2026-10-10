"""Draw the yarn the board's strings are made of (garden/yarn-<kind>.png).

Each picture is one length of thin, matte, fuzzy yarn lying left to right: a core of
short fibres twisted around each other, with loose fibres standing off it. It tiles
end to end, so garden.js repeats it along a string of any length. Re-run this after
changing the look:

    python3 _dev/yarn-texture.py          (needs numpy and pycairo)

The kinds are red (strings between related pages, a muted oxblood), lit (the
strings of the page you are on, only a touch warmer) and grey (the Notes card's
thread to every note). Each is drawn from the same random fibres, so a string
doesn't change shape when it lights up.
"""
import math
import pathlib

import cairo
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "garden"

# Size on the board, in board px; the string's centre line runs along y = H / 2.
# Keep these in step with the yarn pattern in garden/index.html.
T, H = 180, 14
SCALE = 6                 # picture px per board px, so it stays sharp zoomed in
RADIUS = 1.05             # the core's half-thickness
TWIST = 7.5               # board px per turn of the twist

# Colours as (shadow, body, highlight); each fibre picks a shade between them
PALETTES = {
    "red": ((0.20, 0.04, 0.05), (0.43, 0.09, 0.10), (0.64, 0.30, 0.29)),   # muted oxblood
    "lit": ((0.24, 0.05, 0.04), (0.51, 0.12, 0.09), (0.73, 0.36, 0.30)),   # a touch warmer
    "grey": ((0.30, 0.30, 0.31), (0.56, 0.56, 0.57), (0.84, 0.84, 0.85)),
}


def periodic_noise(rng, x, amount, waves=6):
    """Smooth wobble along x that repeats every T, so the picture tiles."""
    out = np.zeros_like(x)
    for k in range(1, waves + 1):
        out += rng.normal() / k * np.sin(2 * math.pi * k * x / T + rng.uniform(0, 2 * math.pi))
    return out * amount


def shade(palette, t):
    """t from -1 (in shadow) to 1 (lit): a colour between the palette's three."""
    lo, mid, hi = palette
    a, b, u = (lo, mid, t + 1) if t < 0 else (mid, hi, t)
    return tuple(p + (q - p) * u for p, q in zip(a, b))


def fibres(seed=7):
    """The core's fibres (split into the runs behind and in front) and the loose ones."""
    rng = np.random.default_rng(seed)
    xs = np.linspace(0, T, 721)
    centre = H / 2 + periodic_noise(rng, xs, 0.12)
    radius = RADIUS * (1 + periodic_noise(rng, xs, 0.12, waves=9))   # slubs: thick and thin spots
    at = lambda arr, x: np.interp(x % T, xs, arr)

    back, front, loose = [], [], []
    # The core: short fibres following the twist, each a little in or out from the middle
    for _ in range(420):
        x0, length = rng.uniform(0, T), rng.uniform(12, 45)
        depth, phase = math.sqrt(rng.uniform(0.05, 1)), rng.uniform(0, 2 * math.pi)
        pitch = TWIST * rng.uniform(0.9, 1.1)
        light, width = rng.normal(0, 0.25), rng.uniform(0.07, 0.16)
        x = np.linspace(x0, x0 + length, int(length * 4))
        theta = 2 * math.pi * x / pitch + phase
        y = at(centre, x) + depth * at(radius, x) * np.sin(theta)
        facing = np.cos(theta)           # toward the viewer: lit; away: behind the core
        # Split the fibre into runs where it goes round the back and comes round again
        run = []
        for xi, yi, fi in zip(x, y, facing):
            if run and (fi >= 0) != (run[-1][2] >= 0):
                (front if run[-1][2] >= 0 else back).append((run, (width, light)))
                run = run[-1:]
            run.append((xi, yi, fi))
        (front if run[-1][2] >= 0 else back).append((run, (width, light)))
    # Loose fibres: lots of short fuzz hugging the surface, and a few long strays curling off it
    for count, (short, long_) in ((700, (3, 10)), (55, (12, 40))):
        for _ in range(count):
            x0 = rng.uniform(0, T)
            side = rng.choice((-1, 1))
            y0 = at(centre, x0) + side * at(radius, x0) * rng.uniform(0.7, 1.0)
            angle = rng.normal(0, 0.6) + (0 if rng.uniform() < 0.5 else math.pi)   # mostly along the yarn
            lift = side * rng.uniform(0.1, 0.8)                                    # ...drifting outward
            curl = rng.normal(0, 0.35)
            step = rng.uniform(0.12, 0.2)
            pts, x, y = [], x0, y0
            for _ in range(int(rng.uniform(short, long_))):
                pts.append((x, y))
                angle += curl * step + rng.normal(0, 0.25)
                x += math.cos(angle) * step
                y += math.sin(angle) * step * 0.6 + lift * step * 0.5
            loose.append((pts, rng.uniform(0.04, 0.08), rng.uniform(-0.3, 0.6), rng.uniform(0.3, 0.75)))
    return back, front, loose


def draw(kind, back, front, loose):
    palette = PALETTES[kind]
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, T * SCALE, H * SCALE)
    ctx = cairo.Context(surface)
    ctx.scale(SCALE, SCALE)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)

    def stroke(pts, width, rgb, alpha):
        for dx in (-T, 0, T):            # wrap around, so the ends meet when tiled
            ctx.move_to(pts[0][0] + dx, pts[0][1])
            for x, y in pts[1:]:
                ctx.line_to(x + dx, y)
            ctx.set_source_rgba(*rgb, alpha)
            ctx.set_line_width(width)
            ctx.stroke()

    # Fibres round the back first, darker, so the core reads as solid between the front ones
    for run, (width, light) in back:
        pts = [(x, y) for x, y, _ in run]
        if len(pts) > 1:
            stroke(pts, width * 1.6, shade(palette, -0.75 + light * 0.3), 0.9)
    for run, (width, light) in front:
        pts = [(x, y) for x, y, _ in run]
        if len(pts) > 1:
            f = float(np.mean([f for _, _, f in run]))
            # Lit from above: the upper half of the yarn is brighter
            above = -float(np.mean([y for _, y, _ in run]) - H / 2) / RADIUS
            stroke(pts, width * 1.4, shade(palette, max(-1, min(1, -0.35 + 0.45 * f + 0.3 * above + light))), 0.95)
    for pts, width, light, alpha in loose:
        stroke(pts, width, shade(palette, light), alpha)
    surface.write_to_png(str(OUT / f"yarn-{kind}.png"))


if __name__ == "__main__":
    layers = fibres()
    for kind in PALETTES:
        draw(kind, *layers)
        print(f"garden/yarn-{kind}.png")
