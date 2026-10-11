# Overnight brief: smoother, cheaper page transitions

You're working alone overnight on mac-wall.com, in this worktree
(`reflection-overnight`, branch `overnight/transitions`). Nobody can answer
questions, so use your judgment and write your reasoning down.

## Goal

Make the transitions between pages on the site as smooth and efficient as possible:
- **First priority:** the garden's flights between cards and pages (`garden/garden.js`:
  `fly`, `travel`, `open`, `arrive`, the title "ghost" glides, string fading,
  `#board.flying`). This includes big boards with hundreds of strings and notes.
- **Second priority:** ordinary navigation between the site's other pages
  (`_layouts/base.html`, `index.html`, `notes/`, `portfolio.html` and so on),
  for example cross-document View Transitions.

"Smooth" means steady frame rate and no dropped frames, hitches, pops or layout shifts.
"Efficient" means little main-thread work, low memory use and no extra work during idle
time. Measure both. Don't decide by eye.

## Research rules

- Look at current best approaches in trusted, well-maintained open-source projects and
  standards material (for example the View Transitions spec and explainers, MDN, the
  Chrome and WebKit teams' writing, and widely used libraries' source and docs).
- **Never copy code.** Read only to understand the technique. Close the source, then
  write your own version here and try to improve on it. Record each source's link and the
  idea you took from it in `_dev/overnight/SOURCES.md`.
- Don't add dependencies. The site already vendors d3 under `garden/vendor/`. If an idea
  only works with a library, reimplement the idea itself, small, in the site's style.

## Method

1. Read the garden code and the git log (the recent "Garden:" commits explain the current
   design and what was already tuned). Understand it before you change it.
2. Build a measurement harness first, in `_dev/overnight/bench/`. Use Playwright
   (`python3 -m venv` in this folder, then `pip install playwright`; the browsers are
   already in `~/.cache/ms-playwright`). Serve the site the way `_dev/garden-thumbs.py`
   does. Script flights and navigations, then record frame timing, long tasks and dropped
   frames (rAF deltas, PerformanceObserver, and a Chromium trace where useful), plus
   memory. Test a small board and a big one (generate extra notes in a throwaway copy, as
   the TODO's stress test did: 150 and 400 notes). Use CPU throttling (4x) to stand in for
   phones.
3. Record a baseline of the current code.
4. Try different methods one at a time, on their own commits, and measure each against the
   baseline. Ideas to try, not a checklist: compositor-only properties and layer
   promotion, WAAPI vs rAF-driven vs CSS transitions, FLIP, View Transitions (same- and
   cross-document), batching reads and writes, `content-visibility`, cheaper string
   rendering during flights (canvas or a cached bitmap vs SVG), easing and timing curves,
   and preloading the destination page.
5. Keep what wins. Revert what doesn't, but write it up.

## Constraints

- Work only in this worktree. Never touch the main checkout, `main`, or `_drafts/`.
  **Don't push** and don't deploy.
- Commit often, with messages in the repo's existing style (plain language, describing
  what a visitor would notice).
- Keep how the site looks the same. Only motion and performance should change.
  `prefers-reduced-motion` must still be respected.
- Check the final result in Chromium, Firefox and WebKit.
- Match the surrounding code's style and comment density.

## Deliverable

`_dev/overnight/REPORT.md`, written for the site's owner in plain language:
- what you measured and how, with a results table (baseline vs each method, small and
  big boards, normal and throttled CPU);
- what you kept and why, and what you tried and dropped, and why;
- anything you'd like the owner to decide or look at.

Keep REPORT.md up to date as you go, not only at the end, because the session may be
stopped at any time.

## Usage limit

A hook watches the account's weekly usage. When it tells you to wrap up, commit, finish
REPORT.md and stop. When it blocks tool calls, stop straight away. Be economical: don't
re-read big files you've already read, and keep benchmark output short (summaries, not
raw traces).

## Offline from now on (added 23:35)

Nothing may leave this device for the rest of the night, apart from your own connection
to Claude. The research phase is over: work from what's already in SOURCES.md and what
you know.
- No WebFetch or WebSearch, no curl/wget/pip or any other network command, no git
  push/fetch/pull. A hook blocks these; don't try to get around it.
- Only local addresses (localhost) in commands and code. In every Playwright script,
  block all requests that aren't to localhost (`page.route`), and serve any outside files
  the pages need (fonts, d3) from local copies you already have, or leave them out.
  Measure with them left out, consistently, for every run.
- Note anything you couldn't do because of this in REPORT.md.

## What the owner most wants to know (added 23:45)

Tonight is also a test of what you can do from your own knowledge, offline. Be as
effective as you can without the network, and keep track of what the network would have
given you.
- **`_dev/overnight/RESEARCH-LATER.md`:** every time you'd have looked something up, add
  it here: the question, why it matters, what you assumed instead, and where you'd look
  (spec, project, or kind of source). Put the ones most likely to change a decision first.
  Mark any assumption your results depend on, so it can be checked first.
- **REPORT.md should start with three short sections, before the results tables:**
  1. **What I learned.** Things you found out from measuring, especially where the
     results surprised you or went against what you expected.
  2. **What I built.** What's on the branch now, and what a visitor would notice.
  3. **What I want to learn about.** Your own questions, the things you're curious about
     after tonight, not only what's useful for this site. Say why each one interests you.
