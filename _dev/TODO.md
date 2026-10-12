# mac-wall.com TODO

## Movie dashboard
- [x] Shrink the dashboard's 83MB download: charts now run on ratings_summary.parquet
      (3MB, counts per movie/year/rating, identical numbers).
- [x] Raw records table: ratings_full.parquet (81MB, all 33.8M ratings with user + date)
      streams in the background (button on phones) and is queried live.
- [ ] Idea: per-user view could show that user's rating histogram / taste profile.
- [x] Supplement post-July-2023 films from TMDB (top 500 by votes, refreshed weekly),
      shown with TMDB score + source labels; never mixed into MovieLens averages.
- [x] First real supplement run (2026-10-03): 500 TMDB films, all with directors;
      The Odyssey (Nolan, 8.0/10) shows under Christopher Nolan.
- [ ] Same title + year in the movie dropdown is ambiguous, e.g. two "The Odyssey (2026)"
      (Nolan's and The Asylum's). Show the director for duplicates.
- [ ] Typo-tolerant search ("Noland" -> "Did you mean Christopher Nolan?"), e.g. DuckDB
      jaro_winkler_similarity. Deferred.
- [ ] RESET button wraps onto its own line around 1160px wide.
- [x] First scheduled refresh (Sun 2026-10-04) succeeded and only committed movies.parquet
      (refreshed TMDB scores); the ratings files rebuilt byte-identical.
- [x] Replaced the red/amber/green score colours with four rating bands (coral / amber /
      soft jade / vivid jade), shared by the score square, trend chart, table and score filter.
- [ ] Idea: the trend chart's "violin" width is drawn from yearly review count, not
      the actual rating spread. ratings_summary.parquet keeps per-star counts, so a real
      distribution (or a star histogram) is possible.
- [x] The 81 MB records file now loads only when the visitor presses the button (it used to
      start on its own on desktops). GitHub Pages tags files with the deploy time, so every
      push (even the weekly bot commit) made returning visitors download it again, and Pages
      has a soft 100 GB/month bandwidth limit.
- [ ] Better option for the records table: have DuckDB read ratings_full.parquet with HTTP
      range requests (`registerFileURL` with the HTTP protocol; GitHub Pages supports
      `Accept-Ranges`), so a query fetches only the row groups it needs and nobody downloads
      81 MB. Sort the file by movieId when building it so a filter touches few row groups.
- [x] movies.parquet and ratings_summary.parquet now download while the DuckDB engine boots
      (2026-10-11), not after it.
- [x] If jsDelivr (where the DuckDB engine comes from) can't be reached, or a data file
      fails, the dashboard says so instead of "Loading…" forever (2026-10-11).
- [ ] "Untitled Spider-Man Reboot" is MovieLens's title; TMDB calls it
      *Spider-Man: Homecoming*.
- [ ] Planet Earth, Band of Brothers, Spellbound still have N/A fields (TMDB lacks the data).

## Site
- Standing rule: when Home, Portfolio, the dashboard, Virtue Ledger or Elenchus change how
      they look, re-run `python3 _dev/garden-thumbs.py` and commit the new screenshots and
      `_data/garden_titles.json`. Full checklist: `_dev/UPDATING.md`.
- [x] `mac-wall.com/elenchus/` (the copy the garden embeds) got 405s from GitHub Pages; it
      now calls elenchus.mac-wall.com/api/chat directly (CORS allowed for mac-wall.com).
- Elenchus runs on Groq's `openai/gpt-oss-120b` (`functions/api/chat.js`, MODEL). Groq
      retires models; if chat breaks, check console.groq.com/docs/deprecations first.
- [x] Animations setting (button beside ◐ on every page): turns the garden off for that
      visitor; the garden also falls back to the plain page if it fails to start.
- [x] Launch pass (2026-10-11):
      - Elenchus API: Cloudflare rate-limiting rule on /api/chat is on (error 1015, ~9
        requests / 10 s per IP). Groq is a free account, so abuse can only use up the free
        quota (Elenchus stops answering until it resets), never cost money. Request size is
        capped; _headers adds security headers and a CSP on elenchus.mac-wall.com.
      - d3 is vendored (garden/vendor/d3.v7.min.js, v7.9.0); Home's arrows are inline SVG
        and Font Awesome is gone.
      - Drafts are no longer in the repo (it's public): _drafts/ is ignored and was removed
        from history. Old commits can still be opened on GitHub by hash until GitHub Support
        purges them ("Remove data from a repository").
      - The overnight/transitions garden work (6 commits) is merged into main.
- [x] elenchus.mac-wall.com no longer serves the repo's working files (_dev/, .github/,
      _config.yml, _data/…): functions/_middleware.js answers 404 for them (2026-10-11).
- [ ] Every page costs ~1.2 MB through the garden: it loads both themes' screenshots
      (~600 KB). (Font Awesome, ~250 KB, is gone.)
- [ ] GitHub turns off scheduled workflows in public repos after 60 days without activity;
      if TMDB scores stop changing (no commits), the weekly refresh switches itself off.
- [ ] Not tested in Safari or on an iPhone (Chromium and Firefox pass, 2026-10-11).
- [x] Garden strings (2026-10-09/10): straight, muted yarn between facing sides of cards,
      clear of titles and region labels; a project's notes zigzag either side of a channel;
      the board recedes while the camera flies. Stress-tested with 20 projects / 400 notes:
      flights stay smooth (~85 frames per 1.4 s flight, ~90 is the ceiling).
- [ ] Garden: load a note card's live copy of its page only when the card is near the
      screen, with a light placeholder (title, date, project) until then. Today every note
      card loads its full page when the garden starts, and its text is also copied into the
      garden page. From the 2026-10-10 stress test (headless Chrome):
      - 150 notes: ~3.8 s until the board is ready, longest freeze ~0.4 s.
      - 400 notes: ~9.5 s, a ~0.9 s freeze and ~170 MB of memory (420 embedded pages).
      Worth doing before ~50 published notes. Generator and test scripts for re-running it
      were in the session scratchpad; rebuild them if needed (a copy of the site with
      generated `_posts`, served with `jekyll serve`, measured with Playwright).
- [ ] Add a "blog feature" that allows me to write up what I learned etc. I can link specific projects, but also just post regular entries 
- [x] Clean up the language. Less technical-sounding, more business casual

## Parking lot
Ideas that are started or researched but on hold. Each says where the work is and what's left.
When one is picked up again, move it into its section above.

- [ ] **Contact page with a message form** (parked 2026-10-05).
      Code: branch `parked/contact-page` (`git switch parked/contact-page`). It has
      `contact.html` (name / email / message, spam-bot field, sent and error states), Home's
      Email button renamed to Contact (no email address anywhere on the site), a garden
      card between Portfolio and Notes, the theme.js redirect and fresh board screenshots.
      Tested locally in Firefox and Chromium with the sender faked.
      Left to do: the form needs something to receive and deliver messages
      (`FORM_ENDPOINT` in contact.html is a placeholder). Options:
      - Preferred: a small Cloudflare Worker of our own (like `virtue-api`) that checks the
        message, only accepts mac-wall.com, and emails it to Gmail with Reply-To set to the
        sender, using Email Routing's send_email binding. Email Routing is already on for
        mac-wall.com, so no third party and no new account. Needs ~10 min in the Cloudflare
        dashboard (create the Worker, add the binding), then put its URL in FORM_ENDPOINT.
      - Quickest: Formspree (free signup, 50 messages/month; messages pass through them).
      Before merging: re-run `_dev/garden-thumbs.py` if any page changed since, and rebase
      on main (garden.js / garden.yml may have moved on).
- [ ] **Comments on notes** (idea, 2026-10-05). Same pattern as the contact form plus
      storage: the contact Worker could grow a Cloudflare D1/KV database. Alternatives:
      giscus (stored in GitHub Discussions, commenters need a GitHub account) or Disqus
      (hosted, but ads and tracking).
