# Site update checklist

Run through this before pushing changes to mac-wall.com.

## 1. Board screenshots (garden)

The board shows a screenshot of five pages, with each page's heading drawn on top
from recorded data. If any of these pages change how they look (layout, heading,
colours, copy near the top), the screenshots and heading data must be refreshed:

| Page | File |
|---|---|
| Home | `index.html` |
| Portfolio | `portfolio.html` |
| Movie Ratings Dashboard | `movie-reviews.html`, `dashboard.js` |
| Virtue Ledger | `ledger/` |
| Elenchus Engine | `elenchus/` |

```bash
python3 _dev/garden-thumbs.py
```

Then commit `garden/thumbs/*.jpg` and `_data/garden_titles.json` with the page change.
Stale screenshots show the old page on its card, and a stale heading record makes the
title glide land in the wrong place. Notes need nothing: their cards are live.

Those stock screenshots are 1400 x 848, so they're only exact in a window that size.
Each visitor's browser also takes its own small snapshot of a page about a second after
it opens (at that window's size, kept in that browser's storage only, overwritten each
visit), and a card uses it whenever the window is the same size again. The snapshot code
is in `garden/garden.js` (search "snapshots"); it uses `garden/vendor/modern-screenshot.js`.

## 2. Cache versions

If you change `dashboard.js`, `elenchus/main.js` or `garden/garden.js`/`garden.css`, bump
the `?v=` number where the page loads it (`movie-reviews.html`, `elenchus/index.html`,
`garden/index.html`) so returning visitors get the new files.

## 2b. The garden is the default view

`theme.js` sends anyone opening a page directly on mac-wall.com to that page's card
in the garden (`/portfolio.html` → `/garden/#/portfolio.html`). A new page only gets
this once its path is added to the list in `theme.js` (and it has a card in
`_data/garden.yml`). Addresses with `?` or `#` are never redirected, so Virtue Ledger
private links keep working; local previews aren't redirected either.

## 3. Cloudflare (elenchus.mac-wall.com)

The Elenchus subdomain is a Cloudflare Pages build of this repo. Its build command
(set in the Cloudflare dashboard, not the repo) deletes files too big or not needed
there. If you rename or add large data files, update it:

```
rm -rf ratings_full.parquet ratings.parquet notes _layouts _data _drafts _config.yml
```

## 4. Check it

Preview locally (`_dev/note.sh preview`), and after pushing, open the live page in
Firefox (the main browser this site is tested in).
