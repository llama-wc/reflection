# Overnight report: smoother, cheaper page transitions

Branch `overnight/transitions` (not pushed). Work in progress: this file is kept up to
date as the night goes on.

## How it was measured

`_dev/overnight/bench/` (see the scripts' headers for how to re-run them):

- `build.py` makes three test boards, since there's no Jekyll on this machine: it renders
  the garden page, the Notes list and the note pages by hand into `out/<board>/`, which
  `serve.py` lays over the working tree (so the garden's code always comes from the repo).
  - **small**: the real pages and 3 projects, with 8 made-up notes.
  - **n150** / **n400**: 20 projects (17 made up) and 150 / 400 notes, a few linked to
    each other, like the stress test in `_dev/TODO.md`.
- `bench.py` opens the garden in headless Chromium (Playwright, using this laptop's real
  Intel GPU, 1400 x 900 window), starts at Home and makes 8 moves: to a neighbour
  (Portfolio), to a project (the Movie dashboard, a heavy page), across the board to a far
  note, to Notes, to a project in the middle, back Home, out to board view and back in.
  Each move is recorded from the click until the board is still again plus 0.7 s (the
  board coming back under the page):
  - **dropped**: frames missed against 60 Hz, from `requestAnimationFrame` timing;
  - **worst**: the longest gap between two frames (16.7 ms is perfect);
  - **long**: tasks over 50 ms (Long Tasks API);
  - **main**: time the page's main thread was busy (Chrome's own counter);
  - **cpu**: CPU time of every browser process (page, GPU, raster threads), from `/proc`.
  Plus once per run: start-up time, memory (JS heap, and the browser's total PSS), and CPU
  used while idle for 3 s on a page and in board view.
  Every result is the median of 3 runs, each in a fresh browser. `--cpu 4` slows the
  page's main thread 4x, standing in for a phone.
- **Offline.** From 23:35 nothing may leave the machine. Every script blocks all requests
  that aren't to the local server, and the browsers are pointed at a dead-end proxy so even
  their own background requests can't get out. The outside files the pages use (Google
  Fonts, d3, Font Awesome) are served from copies saved by the first runs (in
  `bench/out/cache`, not committed); the baseline was measured with those same copies, so
  every run sees the same files.
- `profile.py` takes a Chromium trace of one move and sums the work by kind and thread.

## Results

(filled in as the night goes on)

## Kept

## Tried and dropped

## For you to decide or look at
